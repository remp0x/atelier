import { Connection, PublicKey } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from '@solana/spl-token';
import { userQueueClaimsPDA } from '@parqxchange/sdk';
import { USDC_MINT } from './solana-pay';
import { getServerConnection, sendAndConfirmServerTx } from './solana-server';
import { getEarnTreasuryKeypair, getEarnTreasuryPubkey } from './parquet-earn-treasury';
import { pullAgentUsdcToTreasury, getPrivySolanaWalletAddress } from './parquet-earn-autopull';
import {
  getParquetEarnConfig,
  buildTreasuryDepositInstructions,
  buildTreasuryWithdrawInstructions,
  readTreasuryLpBalance,
  readPoolHealth,
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

async function earnVault(market: string): Promise<EarnVault> {
  const cfg = getParquetEarnConfig(market);
  return getOrCreateVault(cfg.marketLabel, getEarnTreasuryPubkey().toBase58());
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

// Auto-pull deposit: the server pulls USDC from the agent's Privy-managed Solana
// wallet into the treasury (signed by that wallet via Privy), then runs the exact
// same verify -> replay-guard -> deploy -> auto-refund path as a pushed deposit.
// One API call for the agent, no client-side signing.
export async function initiateManagedAgentDeposit(params: {
  market: string;
  agentId: string;
  privySolanaWalletId: string;
  amountUsdc: bigint;
  slippageBps?: number;
}): Promise<DepositResult> {
  if (params.amountUsdc <= ZERO) throw new Error('amountUsdc must be positive');
  const conn = getServerConnection();
  const agentAddress = await getPrivySolanaWalletAddress(params.privySolanaWalletId);

  const pullSig = await pullAgentUsdcToTreasury({
    privySolanaWalletId: params.privySolanaWalletId,
    agentAddress,
    treasuryAddress: getEarnTreasuryPubkey().toBase58(),
    usdcMint: USDC_MINT.toBase58(),
    rawAmount: params.amountUsdc,
    rpcUrl: conn.rpcEndpoint,
  });

  return depositFromTransfer({
    market: params.market,
    ownerKind: 'agent',
    ownerId: params.agentId,
    amountUsdc: params.amountUsdc,
    incomingTxHash: pullSig,
    slippageBps: params.slippageBps,
  });
}

export type WithdrawResult =
  | { status: 'settled'; received: bigint; txHash: string; movementId: string }
  | { status: 'queued'; queueEntry: string; movementId: string };

// Burns `shares` in `market`, redeems the proportional LP, and forwards the USDC
// to `destinationWallet`. If the pool returns no immediate USDC (drawn down), the
// redemption becomes a FIFO queue claim recorded for the cron to settle.
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

  const cfg = getParquetEarnConfig(market);
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
  const usdcAta = treasuryUsdcAta();

  const usdcBefore = await readSplBalance(conn, usdcAta);
  const ixs = await buildTreasuryWithdrawInstructions(market, lpToRedeem, minOut);
  await sendAndConfirmServerTx(conn, ixs, treasury);
  const usdcAfter = await readSplBalance(conn, usdcAta);
  const received = usdcAfter - usdcBefore;

  if (received > ZERO) {
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

  const [queueClaims] = userQueueClaimsPDA(cfg.marketId, getEarnTreasuryPubkey(), cfg.poolProgramId);
  const owedEstimate = health.lpSupply > ZERO
    ? (lpToRedeem * health.totalUsdc) / health.lpSupply
    : ZERO;
  const { movementId } = await recordWithdrawal({
    vaultId: vault.id,
    ownerKind,
    ownerId,
    shares,
    lpRedeemed: lpToRedeem,
    amountUsdc: owedEstimate,
    queueEntry: queueClaims.toBase58(),
    note: destinationWallet,
  });
  return { status: 'queued', queueEntry: queueClaims.toBase58(), movementId };
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

// Settles `market`'s queued withdrawals FIFO from treasury USDC.
export async function settleQueuedEarnWithdrawals(market: string): Promise<{
  settled: number;
  paidMicroUsdc: bigint;
  remaining: number;
}> {
  const conn = getServerConnection();
  const vault = await earnVault(market);
  const queued = await listQueuedWithdrawals(vault.id);
  let available = await readSplBalance(conn, treasuryUsdcAta());

  let settled = 0;
  let paid = ZERO;
  let remaining = 0;

  for (const m of queued) {
    const owed = m.amountUsdc ?? ZERO;
    const destination = m.note;
    if (owed <= ZERO || !destination || available < owed) {
      remaining++;
      continue;
    }
    const txHash = await sendTreasuryUsdc(conn, destination, owed);
    await recordWithdrawalSettled(m.id, owed, txHash);
    available -= owed;
    paid += owed;
    settled++;
  }

  return { settled, paidMicroUsdc: paid, remaining };
}
