import { Connection, PublicKey } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from '@solana/spl-token';
import { USDC_MINT } from './solana-pay';
import { getServerConnection, sendAndConfirmServerTx } from './solana-server';
import { getEarnTreasuryKeypair, getEarnTreasuryPubkey } from './parquet-earn-treasury';
import { getVenue, parseVenueKey } from './earn/registry';
import {
  getOrCreateVault,
  getPosition,
  claimIncomingDepositTx,
  recordDeposit,
  recordWithdrawal,
  recordWithdrawalSettled,
  listQueuedWithdrawals,
  computeLpForShares,
  type EarnOwnerKind,
  type EarnVault,
  type EarnPosition,
} from './parquet-earn-db';

// Earn orchestration: it owns the ERC4626 ledger and the treasury USDC plumbing,
// and dispatches the on-chain deposit/withdraw leg to the venue selected by the
// vault key (parseVenueKey). The `market` param threaded through here is the
// vault key: a bare category (legacy Parquet, e.g. "equity-us") or an explicit
// "venue:market" for other venues.

const ZERO = BigInt(0);
const DEFAULT_SLIPPAGE_BPS = 100;
const TX_POLL_ATTEMPTS = 8;
const TX_POLL_INTERVAL_MS = 2_500;

function venueFor(market: string) {
  return getVenue(parseVenueKey(market).venue);
}

function venueMarket(market: string): string {
  return parseVenueKey(market).market;
}

// The treasury's USDC associated token account is the same across all markets
// (one USDC mint), so it is derived directly rather than per-market.
function treasuryUsdcAta(): PublicKey {
  return getAssociatedTokenAddressSync(USDC_MINT, getEarnTreasuryPubkey());
}

// The vault is keyed by the full market key (the venue adapter and treasury are
// resolved separately); existing Parquet vaults use the bare category as key.
async function earnVault(market: string): Promise<EarnVault> {
  return getOrCreateVault(market, getEarnTreasuryPubkey().toBase58());
}

// The caller's position in a given market's Earn vault, plus the vault itself.
export async function getOwnerEarnPosition(
  market: string,
  ownerKind: EarnOwnerKind,
  ownerId: string,
): Promise<{ vault: EarnVault; position: EarnPosition | null }> {
  const vault = await earnVault(market);
  const position = await getPosition(vault.id, ownerKind, ownerId);
  return { vault, position };
}

async function fetchParsedWithRetry(conn: Connection, sig: string) {
  for (let attempt = 0; attempt < TX_POLL_ATTEMPTS; attempt++) {
    const tx = await conn.getParsedTransaction(sig, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });
    if (tx) return tx;
    if (attempt < TX_POLL_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, TX_POLL_INTERVAL_MS));
    }
  }
  return null;
}

// Verifies that `txSignature` credited at least `expectedRaw` micro-USDC to the
// Earn treasury. Matches on the token-balance entry by owner+mint, version-agnostic.
// Verifies the incoming transfer credited the treasury and returns the SENDER's
// address (the USDC account that decreased) so a failed deploy can auto-refund.
async function verifyIncomingUsdc(
  conn: Connection,
  txSignature: string,
  expectedRaw: bigint,
): Promise<string | null> {
  const tx = await fetchParsedWithRetry(conn, txSignature);
  if (!tx) throw new Error('deposit transfer not found on-chain after polling');
  if (tx.meta?.err) throw new Error('deposit transfer failed on-chain');

  const treasury = getEarnTreasuryPubkey().toBase58();
  const usdc = USDC_MINT.toBase58();
  const pres = tx.meta?.preTokenBalances ?? [];
  const posts = tx.meta?.postTokenBalances ?? [];

  const match = (b: { owner?: string; mint: string }) => b.owner === treasury && b.mint === usdc;
  const pre = pres.find(match);
  const post = posts.find(match);
  const delta = BigInt(post?.uiTokenAmount.amount ?? '0') - BigInt(pre?.uiTokenAmount.amount ?? '0');

  if (delta < expectedRaw) {
    throw new Error(
      `deposit transfer credited ${delta} micro-USDC to treasury, expected >= ${expectedRaw}`,
    );
  }

  // Sender = the non-treasury USDC account whose balance decreased.
  let sender: string | null = null;
  for (const p of pres) {
    if (p.mint !== usdc || !p.owner || p.owner === treasury) continue;
    const after = posts.find((q) => q.accountIndex === p.accountIndex);
    const dec = BigInt(p.uiTokenAmount.amount) - BigInt(after?.uiTokenAmount.amount ?? '0');
    if (dec > BigInt(0)) { sender = p.owner; break; }
  }
  return sender;
}

async function sendTreasuryUsdc(
  conn: Connection,
  destinationWallet: string,
  rawAmount: bigint,
): Promise<string> {
  const treasury = getEarnTreasuryKeypair();
  const dest = new PublicKey(destinationWallet);
  const fromAta = treasuryUsdcAta();
  const toAta = getAssociatedTokenAddressSync(USDC_MINT, dest, true);

  const instructions = [];
  let toAtaExists = true;
  try {
    await getAccount(conn, toAta);
  } catch (err) {
    if (err instanceof TokenAccountNotFoundError || err instanceof TokenInvalidAccountOwnerError) {
      toAtaExists = false;
    } else {
      throw err;
    }
  }
  if (!toAtaExists) {
    instructions.push(
      createAssociatedTokenAccountInstruction(treasury.publicKey, toAta, dest, USDC_MINT),
    );
  }
  instructions.push(
    createTransferInstruction(fromAta, toAta, treasury.publicKey, rawAmount),
  );
  return sendAndConfirmServerTx(conn, instructions, treasury);
}

export interface DepositResult {
  txHash: string;
  lpMinted: bigint;
  sharesMinted: bigint;
  position: EarnPosition;
}

// Deploys USDC that is ALREADY in the treasury into `market`'s venue, mints the
// depositor's shares from the exact position units minted, and records it
// atomically. The venue owns the on-chain deposit + unit measurement.
export async function deployTreasuryDeposit(params: {
  market: string;
  ownerKind: EarnOwnerKind;
  ownerId: string;
  amountUsdc: bigint;
  slippageBps?: number;
}): Promise<DepositResult> {
  const { market, ownerKind, ownerId, amountUsdc } = params;
  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  if (amountUsdc <= ZERO) throw new Error('amountUsdc must be positive');

  const { txHash, unitsMinted } = await venueFor(market).deposit(venueMarket(market), amountUsdc, slippageBps);

  const vault = await earnVault(market);
  const { position, sharesMinted } = await recordDeposit({
    vaultId: vault.id,
    ownerKind,
    ownerId,
    amountUsdc,
    lpMinted: unitsMinted,
    txHash,
  });
  return { txHash, lpMinted: unitsMinted, sharesMinted, position };
}

// Deposit where the depositor pushed USDC to the treasury themselves. Verifies
// the incoming transfer, then deploys + accounts into `market`.
export async function depositFromTransfer(params: {
  market: string;
  ownerKind: EarnOwnerKind;
  ownerId: string;
  amountUsdc: bigint;
  incomingTxHash: string;
  slippageBps?: number;
}): Promise<DepositResult> {
  const conn = getServerConnection();
  const sender = await verifyIncomingUsdc(conn, params.incomingTxHash, params.amountUsdc);

  // Replay guard: an incoming transfer signature may be deployed at most once.
  // Claimed atomically before any treasury funds move, so concurrent or repeated
  // submissions of the same signature cannot double-deploy or double-mint shares.
  const claimed = await claimIncomingDepositTx({
    incomingTxHash: params.incomingTxHash,
    ownerKind: params.ownerKind,
    ownerId: params.ownerId,
    amountUsdc: params.amountUsdc,
  });
  if (!claimed) {
    throw new Error('This deposit transfer has already been processed');
  }

  try {
    return await deployTreasuryDeposit(params);
  } catch (err) {
    // Funds already reached the treasury (push model). If the deploy fails (e.g.
    // a stranded/paused pool), refund the sender so USDC never strands.
    const reason = err instanceof Error ? err.message : String(err);
    if (!sender) {
      throw new Error(`Deposit failed; sender unknown, funds held in treasury -- contact support. Reason: ${reason}`);
    }
    let refundTx: string;
    try {
      refundTx = await sendTreasuryUsdc(conn, sender, params.amountUsdc);
    } catch {
      throw new Error(`Deposit failed and auto-refund failed -- funds held in treasury, contact support. Reason: ${reason}`);
    }
    throw new Error(`Deposit could not be completed; your USDC was refunded (tx ${refundTx}). Reason: ${reason}`);
  }
}

// Auto-pull deposit (agent's Privy server wallet -> treasury -> pool). NOT yet
// implementable: outbound Solana signing from a Privy server wallet needs
// createSolanaKitSigner (@solana/kit / web3.js 2.0), which the repo does not use.
export async function initiateManagedAgentDeposit(_params: {
  market: string;
  agentId: string;
  privySolanaWalletId: string;
  agentWalletAddress: string;
  amountUsdc: bigint;
  slippageBps?: number;
}): Promise<DepositResult> {
  throw new Error(
    'managed agent auto-pull deposit pending Privy server-wallet Solana signing (createSolanaKitSigner / @solana/kit). Use depositFromTransfer with an agent-pushed transfer until then.',
  );
}

export type WithdrawResult =
  | { status: 'settled'; received: bigint; txHash: string; movementId: string }
  | { status: 'queued'; queueEntry: string; movementId: string };

// App-level marker for a deferred withdrawal. A venue redeem is atomic (it burns
// units and pays, or reverts), so when free liquidity can't cover a redemption
// the venue reports illiquid; we earmark it here and let the cron redeem it once
// liquidity returns.
const DEFERRED_WITHDRAWAL = 'pending';

// Burns `shares` in `market`, asks the venue to redeem the proportional position
// units, and forwards the USDC to `destinationWallet`. When the venue can settle,
// the redeem clears and we pay out in one shot. When it can't (paused / drawn
// down), the depositor's shares and units are earmarked in the ledger and the
// cron redeems + pays out later via settleQueuedEarnWithdrawals.
export async function withdrawForOwner(params: {
  market: string;
  ownerKind: EarnOwnerKind;
  ownerId: string;
  shares: bigint;
  destinationWallet: string;
  slippageBps?: number;
}): Promise<WithdrawResult> {
  const { market, ownerKind, ownerId, shares, destinationWallet } = params;
  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  if (shares <= ZERO) throw new Error('shares must be positive');

  const venue = venueFor(market);
  const marketName = venueMarket(market);
  if (!venue.isMarketEnabled(marketName)) throw new Error(`market "${market}" is not enabled for Earn`);

  const conn = getServerConnection();
  const vault = await earnVault(market);
  const position = await getPosition(vault.id, ownerKind, ownerId);
  if (!position || position.shares < shares) {
    throw new Error('withdrawal shares exceed position balance');
  }

  const lpToRedeem = computeLpForShares(vault, shares);
  if (lpToRedeem <= ZERO) throw new Error('shares redeem to zero LP');

  const outcome = await venue.withdraw(marketName, lpToRedeem, slippageBps);

  if (outcome.status === 'settled') {
    const payoutTx = await sendTreasuryUsdc(conn, destinationWallet, outcome.received);
    const { movementId } = await recordWithdrawal({
      vaultId: vault.id,
      ownerKind,
      ownerId,
      shares,
      lpRedeemed: lpToRedeem,
      amountUsdc: outcome.received,
      txHash: payoutTx,
    });
    return { status: 'settled', received: outcome.received, txHash: payoutTx, movementId };
  }

  // Deferred: burn the depositor's shares and earmark their units in the ledger.
  // The on-chain units stay in the treasury as backing; the cron redeems them
  // once liquidity returns. This opens a transient ledger<>on-chain gap that
  // reconcileEarnVault surfaces, and closes when the cron settles.
  const { movementId } = await recordWithdrawal({
    vaultId: vault.id,
    ownerKind,
    ownerId,
    shares,
    lpRedeemed: lpToRedeem,
    amountUsdc: outcome.estimateUsdc,
    queueEntry: DEFERRED_WITHDRAWAL,
    note: destinationWallet,
  });
  return { status: 'queued', queueEntry: DEFERRED_WITHDRAWAL, movementId };
}

// Compares the ledger's recorded position units for `market` against the
// treasury's actual on-chain units. Drift means a deposit/withdrawal failed to
// record -- surface it, never auto-correct.
export async function reconcileEarnVault(market: string): Promise<{
  market: string;
  dbLpTokens: bigint;
  onchainLpTokens: bigint;
  drift: bigint;
}> {
  const vault = await earnVault(market);
  const onchain = await venueFor(market).readPositionUnits(venueMarket(market));
  return {
    market,
    dbLpTokens: vault.totalLpTokens,
    onchainLpTokens: onchain,
    drift: onchain - vault.totalLpTokens,
  };
}

// Settles `market`'s deferred withdrawals FIFO. Each carries the earmarked
// position units (lpDelta) and the destination (note); the cron asks the venue to
// redeem those units once it has free liquidity, then forwards the realized USDC.
// Paying the realized amount (not the request-time estimate) keeps the vault
// solvent across ratio drift between request and settlement.
export async function settleQueuedEarnWithdrawals(market: string): Promise<{
  settled: number;
  paidMicroUsdc: bigint;
  remaining: number;
}> {
  const conn = getServerConnection();
  const venue = venueFor(market);
  const marketName = venueMarket(market);
  const vault = await earnVault(market);
  const queued = await listQueuedWithdrawals(vault.id);
  if (queued.length === 0) return { settled: 0, paidMicroUsdc: ZERO, remaining: 0 };

  let settled = 0;
  let paid = ZERO;
  let remaining = 0;

  for (const m of queued) {
    const lp = m.lpDelta !== null && m.lpDelta < ZERO ? -m.lpDelta : ZERO;
    const destination = m.note;
    if (lp <= ZERO || !destination) {
      remaining++;
      continue;
    }

    let outcome;
    try {
      outcome = await venue.withdraw(marketName, lp, DEFAULT_SLIPPAGE_BPS);
    } catch (err) {
      console.warn('queued category withdraw redeem failed:', err instanceof Error ? err.message : err);
      remaining++;
      continue;
    }
    if (outcome.status !== 'settled') {
      remaining++;
      continue;
    }

    const txHash = await sendTreasuryUsdc(conn, destination, outcome.received);
    await recordWithdrawalSettled(m.id, outcome.received, txHash);
    paid += outcome.received;
    settled++;
  }

  return { settled, paidMicroUsdc: paid, remaining };
}
