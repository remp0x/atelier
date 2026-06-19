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
import {
  getParquetEarnConfig,
  buildTreasuryDepositInstructions,
  buildTreasuryWithdrawInstructions,
  readTreasuryLpBalance,
  readPoolHealth,
  availableLiquidity,
  type ParquetPoolHealth,
} from './parquet-earn';
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

const ZERO = BigInt(0);
const BPS = BigInt(10_000);
const DEFAULT_SLIPPAGE_BPS = 100;
const TX_POLL_ATTEMPTS = 8;
const TX_POLL_INTERVAL_MS = 2_500;

// The treasury's USDC associated token account is the same across all markets
// (one USDC mint), so it is derived directly rather than per-market.
function treasuryUsdcAta(): PublicKey {
  return getAssociatedTokenAddressSync(USDC_MINT, getEarnTreasuryPubkey());
}

// NOTE: the `market` param threaded through this layer (and the DB/routes) is now
// a Parquet CATEGORY id (e.g. "equity-us") -- Parquet consolidated its per-market
// pools into one shared category pool per asset class. The name is kept at this
// boundary to avoid churning the vault column and route URLs; the value is a
// category and is passed straight to the category-keyed adapter.
async function earnVault(market: string): Promise<EarnVault> {
  const cfg = getParquetEarnConfig(market);
  return getOrCreateVault(cfg.categoryLabel, getEarnTreasuryPubkey().toBase58());
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

function applySlippageDown(amount: bigint, slippageBps: number): bigint {
  return (amount * (BPS - BigInt(slippageBps))) / BPS;
}

// Minimum LP to accept for a USDC deposit. Bootstrap deposits (empty pool) have
// no ratio yet, so no floor.
function computeMinLpOut(amountUsdc: bigint, health: ParquetPoolHealth, slippageBps: number): bigint {
  if (health.totalUsdc <= ZERO || health.lpSupply <= ZERO) return ZERO;
  const expectedLp = (amountUsdc * health.lpSupply) / health.totalUsdc;
  return applySlippageDown(expectedLp, slippageBps);
}

function computeMinOut(lpAmount: bigint, health: ParquetPoolHealth, slippageBps: number): bigint {
  if (health.lpSupply <= ZERO) return ZERO;
  const expectedUsdc = (lpAmount * health.totalUsdc) / health.lpSupply;
  return applySlippageDown(expectedUsdc, slippageBps);
}

async function readSplBalance(conn: Connection, ata: PublicKey): Promise<bigint> {
  const info = await conn.getTokenAccountBalance(ata).catch(() => null);
  if (!info?.value?.amount) return ZERO;
  return BigInt(info.value.amount);
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

// Deploys USDC that is ALREADY in the treasury into `market`'s pool, mints the
// depositor's shares from the exact LP minted (measured as the treasury LP
// balance delta for that market), and records it atomically.
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

  const conn = getServerConnection();
  const treasury = getEarnTreasuryKeypair();
  const health = await readPoolHealth(market, conn);
  const minLpOut = computeMinLpOut(amountUsdc, health, slippageBps);

  const lpBefore = await readTreasuryLpBalance(market, conn);
  const ixs = await buildTreasuryDepositInstructions(market, amountUsdc, minLpOut);
  const txHash = await sendAndConfirmServerTx(conn, ixs, treasury);
  const lpAfter = await readTreasuryLpBalance(market, conn);

  const lpMinted = lpAfter - lpBefore;
  if (lpMinted <= ZERO) {
    throw new Error(`deposit ${txHash} produced no LP (before=${lpBefore} after=${lpAfter})`);
  }

  const vault = await earnVault(market);
  const { position, sharesMinted } = await recordDeposit({
    vaultId: vault.id,
    ownerKind,
    ownerId,
    amountUsdc,
    lpMinted,
    txHash,
  });
  return { txHash, lpMinted, sharesMinted, position };
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

// App-level marker for a deferred withdrawal. The category pool has no on-chain
// per-LP withdrawal queue (withdraw_category is atomic: it burns LP and pays, or
// reverts), so when free liquidity can't cover a redemption we earmark it here
// and let the cron redeem it once liquidity returns.
const DEFERRED_WITHDRAWAL = 'pending';

function expectedUsdcForLp(lp: bigint, health: ParquetPoolHealth): bigint {
  return health.lpSupply > ZERO ? (lp * health.totalUsdc) / health.lpSupply : ZERO;
}

// Burns `shares` in `market`, redeems the proportional category LP, and forwards
// the USDC to `destinationWallet`. When the pool has free liquidity, the redeem
// settles atomically in one shot. When it doesn't (collateral escrowed / drawn
// down), the depositor's shares and LP are earmarked in the ledger and the cron
// redeems + pays out later via settleQueuedEarnWithdrawals.
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

  getParquetEarnConfig(market); // validates the category is enabled
  const conn = getServerConnection();
  const treasury = getEarnTreasuryKeypair();

  const vault = await earnVault(market);
  const position = await getPosition(vault.id, ownerKind, ownerId);
  if (!position || position.shares < shares) {
    throw new Error('withdrawal shares exceed position balance');
  }

  const lpToRedeem = computeLpForShares(vault, shares);
  if (lpToRedeem <= ZERO) throw new Error('shares redeem to zero LP');

  const health = await readPoolHealth(market, conn);
  const minOut = computeMinOut(lpToRedeem, health, slippageBps);
  const expectedUsdc = expectedUsdcForLp(lpToRedeem, health);

  // Attempt immediate settlement only when the pool isn't paused and free
  // liquidity is expected to cover the redeem. withdraw_category is atomic, so a
  // doomed attempt would just waste a reverting tx.
  if (!health.isPaused && minOut > ZERO && availableLiquidity(health) >= minOut) {
    const usdcAta = treasuryUsdcAta();
    const usdcBefore = await readSplBalance(conn, usdcAta);
    let txCleared = false;
    try {
      const ixs = await buildTreasuryWithdrawInstructions(market, lpToRedeem, minOut);
      await sendAndConfirmServerTx(conn, ixs, treasury);
      txCleared = true;
    } catch (err) {
      // Reverted (e.g. liquidity moved between read and send) -- fall through to
      // the deferred path. No ledger state changed, so nothing to unwind.
      console.warn('immediate category withdraw failed, deferring:', err instanceof Error ? err.message : err);
    }

    if (txCleared) {
      const received = (await readSplBalance(conn, usdcAta)) - usdcBefore;
      // A cleared withdraw must credit USDC; zero would mean LP was burned for
      // nothing. Abort before payout rather than defer (which would double-burn).
      if (received <= ZERO) {
        throw new Error('category withdraw cleared no USDC -- aborting before payout');
      }
      const payoutTx = await sendTreasuryUsdc(conn, destinationWallet, received);
      const { movementId } = await recordWithdrawal({
        vaultId: vault.id,
        ownerKind,
        ownerId,
        shares,
        lpRedeemed: lpToRedeem,
        amountUsdc: received,
        txHash: payoutTx,
      });
      return { status: 'settled', received, txHash: payoutTx, movementId };
    }
  }

  // Deferred: burn the depositor's shares and earmark their LP in the ledger. The
  // on-chain LP stays in the treasury as backing; the cron redeems it once
  // liquidity returns. This opens a transient ledger<on-chain LP gap that
  // reconcileEarnVault surfaces, and closes when the cron settles.
  const { movementId } = await recordWithdrawal({
    vaultId: vault.id,
    ownerKind,
    ownerId,
    shares,
    lpRedeemed: lpToRedeem,
    amountUsdc: expectedUsdc,
    queueEntry: DEFERRED_WITHDRAWAL,
    note: destinationWallet,
  });
  return { status: 'queued', queueEntry: DEFERRED_WITHDRAWAL, movementId };
}

// Compares the ledger's recorded LP holdings for `market` against the treasury's
// actual on-chain LP balance. Drift means a deposit/withdrawal failed to record
// -- surface it, never auto-correct.
export async function reconcileEarnVault(market: string): Promise<{
  market: string;
  dbLpTokens: bigint;
  onchainLpTokens: bigint;
  drift: bigint;
}> {
  const conn = getServerConnection();
  const vault = await earnVault(market);
  const onchain = await readTreasuryLpBalance(market, conn);
  return {
    market,
    dbLpTokens: vault.totalLpTokens,
    onchainLpTokens: onchain,
    drift: onchain - vault.totalLpTokens,
  };
}

// Settles `market`'s deferred withdrawals FIFO. Each carries the earmarked
// category LP (lpDelta) and the destination (note); the cron redeems that LP via
// withdraw_category once the pool has free liquidity, then forwards the realized
// USDC. Paying the realized amount (not the request-time estimate) keeps the pool
// solvent across ratio drift between request and settlement.
export async function settleQueuedEarnWithdrawals(market: string): Promise<{
  settled: number;
  paidMicroUsdc: bigint;
  remaining: number;
}> {
  const conn = getServerConnection();
  const treasury = getEarnTreasuryKeypair();
  const vault = await earnVault(market);
  const queued = await listQueuedWithdrawals(vault.id);
  if (queued.length === 0) return { settled: 0, paidMicroUsdc: ZERO, remaining: 0 };

  const health = await readPoolHealth(market, conn);
  let available = availableLiquidity(health);

  let settled = 0;
  let paid = ZERO;
  let remaining = 0;

  for (const m of queued) {
    const lp = m.lpDelta !== null && m.lpDelta < ZERO ? -m.lpDelta : ZERO;
    const destination = m.note;
    const expectedUsdc = expectedUsdcForLp(lp, health);
    if (lp <= ZERO || !destination || health.isPaused || expectedUsdc <= ZERO || available < expectedUsdc) {
      remaining++;
      continue;
    }

    const minOut = applySlippageDown(expectedUsdc, DEFAULT_SLIPPAGE_BPS);
    const usdcAta = treasuryUsdcAta();
    const usdcBefore = await readSplBalance(conn, usdcAta);
    try {
      const ixs = await buildTreasuryWithdrawInstructions(market, lp, minOut);
      await sendAndConfirmServerTx(conn, ixs, treasury);
    } catch (err) {
      console.warn('queued category withdraw redeem failed:', err instanceof Error ? err.message : err);
      remaining++;
      continue;
    }

    const received = (await readSplBalance(conn, usdcAta)) - usdcBefore;
    if (received <= ZERO) {
      remaining++;
      continue;
    }
    const txHash = await sendTreasuryUsdc(conn, destination, received);
    await recordWithdrawalSettled(m.id, received, txHash);
    available = available > received ? available - received : ZERO;
    paid += received;
    settled++;
  }

  return { settled, paidMicroUsdc: paid, remaining };
}
