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
import {
  getParquetEarnConfig,
  buildTreasuryDepositInstructions,
  buildTreasuryWithdrawInstructions,
  readTreasuryLpBalance,
  readPoolHealth,
  getTreasuryTokenAccounts,
  type ParquetPoolHealth,
} from './parquet-earn';
import {
  getOrCreateVault,
  getPosition,
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

async function earnVault(): Promise<EarnVault> {
  const cfg = getParquetEarnConfig();
  return getOrCreateVault(cfg.marketLabel, getEarnTreasuryPubkey().toBase58());
}

// The caller's position in the configured Earn vault, plus the vault itself.
export async function getOwnerEarnPosition(
  ownerKind: EarnOwnerKind,
  ownerId: string,
): Promise<{ vault: EarnVault; position: EarnPosition | null }> {
  const vault = await earnVault();
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
// Earn treasury. Matches on the token-balance entry by owner+mint, which is
// version-agnostic (no account-key index mapping needed).
async function verifyIncomingUsdc(
  conn: Connection,
  txSignature: string,
  expectedRaw: bigint,
): Promise<void> {
  const tx = await fetchParsedWithRetry(conn, txSignature);
  if (!tx) throw new Error('deposit transfer not found on-chain after polling');
  if (tx.meta?.err) throw new Error('deposit transfer failed on-chain');

  const treasury = getEarnTreasuryPubkey().toBase58();
  const usdc = USDC_MINT.toBase58();
  const match = (b: { owner?: string; mint: string }) => b.owner === treasury && b.mint === usdc;

  const pre = (tx.meta?.preTokenBalances ?? []).find(match);
  const post = (tx.meta?.postTokenBalances ?? []).find(match);
  const delta = BigInt(post?.uiTokenAmount.amount ?? '0') - BigInt(pre?.uiTokenAmount.amount ?? '0');

  if (delta < expectedRaw) {
    throw new Error(
      `deposit transfer credited ${delta} micro-USDC to treasury, expected >= ${expectedRaw}`,
    );
  }
}

async function sendTreasuryUsdc(
  conn: Connection,
  destinationWallet: string,
  rawAmount: bigint,
): Promise<string> {
  const treasury = getEarnTreasuryKeypair();
  const dest = new PublicKey(destinationWallet);
  const { usdc: fromAta } = getTreasuryTokenAccounts();
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

// Deploys USDC that is ALREADY in the treasury into the Parquet pool, mints the
// depositor's shares from the exact LP minted (measured as the treasury LP
// balance delta), and records it atomically. Assumes the funds arrived in the
// treasury already -- see depositFromTransfer / the auto-pull seam below for how
// they get there.
export async function deployTreasuryDeposit(params: {
  ownerKind: EarnOwnerKind;
  ownerId: string;
  amountUsdc: bigint;
  slippageBps?: number;
}): Promise<DepositResult> {
  const { ownerKind, ownerId, amountUsdc } = params;
  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  if (amountUsdc <= ZERO) throw new Error('amountUsdc must be positive');

  const conn = getServerConnection();
  const treasury = getEarnTreasuryKeypair();
  const health = await readPoolHealth(conn);
  const minLpOut = computeMinLpOut(amountUsdc, health, slippageBps);

  const lpBefore = await readTreasuryLpBalance(conn);
  const ixs = await buildTreasuryDepositInstructions(amountUsdc, minLpOut);
  const txHash = await sendAndConfirmServerTx(conn, ixs, treasury);
  const lpAfter = await readTreasuryLpBalance(conn);

  const lpMinted = lpAfter - lpBefore;
  if (lpMinted <= ZERO) {
    throw new Error(`deposit ${txHash} produced no LP (before=${lpBefore} after=${lpAfter})`);
  }

  const vault = await earnVault();
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

// Deposit where the depositor pushed USDC to the treasury themselves (a human
// signing client-side, or an agent that already transferred). Verifies the
// incoming transfer, then deploys + accounts.
export async function depositFromTransfer(params: {
  ownerKind: EarnOwnerKind;
  ownerId: string;
  amountUsdc: bigint;
  incomingTxHash: string;
  slippageBps?: number;
}): Promise<DepositResult> {
  const conn = getServerConnection();
  await verifyIncomingUsdc(conn, params.incomingTxHash, params.amountUsdc);
  return deployTreasuryDeposit(params);
}

// Auto-pull deposit: Atelier moves USDC from a headless agent's Privy server
// wallet into the treasury, then deploys. This is the only "agent does nothing"
// path and it is NOT yet implementable: signing an outbound Solana transfer from
// a Privy server wallet requires createSolanaKitSigner (@solana/kit / web3.js
// 2.0), which the repo does not use. Pending that integration.
export async function initiateManagedAgentDeposit(_params: {
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

// Burns `shares`, redeems the proportional LP from the pool, and forwards the
// resulting USDC to `destinationWallet`. If the pool is drawn down and Parquet
// returns no immediate USDC, the redemption becomes a FIFO queue claim: we
// detect that as a zero treasury USDC delta and record the withdrawal as queued
// for the cron to settle. (Exact queue/settlement mechanics pending Parquet
// confirmation -- open question.)
export async function withdrawForOwner(params: {
  ownerKind: EarnOwnerKind;
  ownerId: string;
  shares: bigint;
  destinationWallet: string;
  slippageBps?: number;
}): Promise<WithdrawResult> {
  const { ownerKind, ownerId, shares, destinationWallet } = params;
  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  if (shares <= ZERO) throw new Error('shares must be positive');

  const cfg = getParquetEarnConfig();
  const conn = getServerConnection();
  const treasury = getEarnTreasuryKeypair();

  const vault = await earnVault();
  const position = await getPosition(vault.id, ownerKind, ownerId);
  if (!position || position.shares < shares) {
    throw new Error('withdrawal shares exceed position balance');
  }

  const lpToRedeem = computeLpForShares(vault, shares);
  if (lpToRedeem <= ZERO) throw new Error('shares redeem to zero LP');

  const health = await readPoolHealth(conn);
  const minOut = computeMinOut(lpToRedeem, health, slippageBps);
  const { usdc: treasuryUsdcAta } = getTreasuryTokenAccounts();

  const usdcBefore = await readSplBalance(conn, treasuryUsdcAta);
  const ixs = await buildTreasuryWithdrawInstructions(lpToRedeem, minOut);
  await sendAndConfirmServerTx(conn, ixs, treasury);
  const usdcAfter = await readSplBalance(conn, treasuryUsdcAta);
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
  // Record the owed estimate (amountUsdc) and destination (note) so the
  // maintenance cron can settle this claim once liquidity reaches the treasury.
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

// Compares the ledger's recorded LP holdings against the treasury's actual
// on-chain LP balance. Drift means a deposit/withdrawal failed to record or LP
// moved out of band -- surface it, never auto-correct (that would paper over a
// bug in a custodial ledger).
export async function reconcileEarnVault(): Promise<{
  dbLpTokens: bigint;
  onchainLpTokens: bigint;
  drift: bigint;
}> {
  const conn = getServerConnection();
  const vault = await earnVault();
  const onchain = await readTreasuryLpBalance(conn);
  return {
    dbLpTokens: vault.totalLpTokens,
    onchainLpTokens: onchain,
    drift: onchain - vault.totalLpTokens,
  };
}

// Settles queued withdrawals FIFO from whatever USDC has reached the treasury
// (from the pool's queue payouts or fresh deposits), forwarding each owed amount
// to its recorded destination. The active on-chain queue crank (pool harvestIx)
// needs the exact PayoutQueueEntry accounts to pass as remainingAccounts, which
// is pending Parquet's queue-mechanics confirmation -- until then this drains
// passively from available treasury balance.
export async function settleQueuedEarnWithdrawals(): Promise<{
  settled: number;
  paidMicroUsdc: bigint;
  remaining: number;
}> {
  const conn = getServerConnection();
  const vault = await earnVault();
  const queued = await listQueuedWithdrawals(vault.id);
  const { usdc: treasuryUsdcAta } = getTreasuryTokenAccounts();
  let available = await readSplBalance(conn, treasuryUsdcAta);

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
