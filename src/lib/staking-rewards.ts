import { createHash } from 'crypto';
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { createSyncNativeInstruction } from '@solana/spl-token';
import bs58 from 'bs58';
import { atelierClient, getTotalIndexedWithdrawals } from './atelier-db';
import {
  getAtelierKeypair,
  getServerConnection,
  pollTransactionConfirmation,
} from './solana-server';
import {
  STAKING_PROGRAM_ID,
  findPoolPda,
  findRewardVaultPda,
} from './staking-config';
import { fetchPool } from './staking-program';

/**
 * Server-side reward funding for atelier-staking.
 *
 * The on-chain program is the source of truth for balances; this module only
 * (1) decides how much SOL to distribute this epoch, (2) wraps it into the
 * pool's wSOL reward vault, and (3) cranks the accumulator so stakers'
 * claimable balances reflect it. Creator fees arrive in SOL and rewards are
 * paid in SOL, so there is no price conversion or swap anywhere in the flow.
 * Every run is recorded for audit and idempotency.
 */

const DEFAULT_SHARE_BPS = 5000; // 50% of creator-fee revenue to stakers
const MIN_FUNDING_INTERVAL_SECS = 6 * 24 * 60 * 60; // weekly cadence, 1-day slack
const LAMPORTS_PER_SOL = 1_000_000_000n;
/** Never drain the treasury below this: it pays gas for every backend flow. */
const TREASURY_GAS_RESERVE_LAMPORTS = 100_000_000n; // 0.1 SOL
/** Sanity ceiling: a single epoch never distributes more than this. A budget
 *  above it is treated as a misconfiguration (fat-fingered override, or a huge
 *  frozen-cursor backlog after an override was removed) and skipped, not sent.
 *  Configurable via STAKING_MAX_EPOCH_SOL so the cap can be raised as real
 *  weekly revenue grows past the default (otherwise a genuine skyrocket would
 *  trip the cap and, since the cursor doesn't advance on a skip, wedge). */
const DEFAULT_MAX_EPOCH_SOL = 50;
function maxEpochLamports(): bigint {
  const raw = Number(process.env.STAKING_MAX_EPOCH_SOL ?? DEFAULT_MAX_EPOCH_SOL);
  const sol = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_EPOCH_SOL;
  return BigInt(Math.floor(sol * Number(LAMPORTS_PER_SOL)));
}
const REVENUE_CURSOR_ID = 'creator_fees';
const FUNDING_LOCK_ID = 'staking_fund';
/** A crashed run auto-releases the lock after this, so it can never wedge. */
const FUNDING_LOCK_TTL_MS = 5 * 60 * 1000;

let initialized = false;

async function initStakingRewardsDb(): Promise<void> {
  if (initialized) return;
  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS staking_reward_funding_sol (
      id TEXT PRIMARY KEY,
      amount_lamports TEXT NOT NULL,
      transfer_sig TEXT,
      crank_sig TEXT,
      revenue_lamports TEXT NOT NULL DEFAULT '0',
      share_bps INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS staking_revenue_cursor (
      id TEXT PRIMARY KEY,
      cumulative_lamports TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS staking_funding_lock (
      id TEXT PRIMARY KEY,
      locked_until INTEGER NOT NULL DEFAULT 0
    )
  `);
  initialized = true;
}

/**
 * Mutual exclusion across concurrent invocations (scheduled cron racing a manual
 * trigger, or a Vercel double-invoke). The conditional UPDATE is atomic in
 * libSQL, so exactly one caller flips the lock; the TTL guarantees a crashed run
 * auto-releases. Returns true if the lock was acquired.
 */
async function acquireFundingLock(): Promise<boolean> {
  const now = Date.now();
  await atelierClient.execute({
    sql: `INSERT INTO staking_funding_lock (id, locked_until) VALUES (?, 0)
          ON CONFLICT(id) DO NOTHING`,
    args: [FUNDING_LOCK_ID],
  });
  const res = await atelierClient.execute({
    sql: `UPDATE staking_funding_lock SET locked_until = ?
          WHERE id = ? AND locked_until < ?`,
    args: [now + FUNDING_LOCK_TTL_MS, FUNDING_LOCK_ID, now],
  });
  return res.rowsAffected > 0;
}

async function releaseFundingLock(): Promise<void> {
  await atelierClient.execute({
    sql: `UPDATE staking_funding_lock SET locked_until = 0 WHERE id = ?`,
    args: [FUNDING_LOCK_ID],
  });
}

async function getRevenueCursorLamports(): Promise<bigint | null> {
  const rows = await atelierClient.execute({
    sql: `SELECT cumulative_lamports FROM staking_revenue_cursor WHERE id = ?`,
    args: [REVENUE_CURSOR_ID],
  });
  if (rows.rows.length === 0) return null;
  const raw = rows.rows[0].cumulative_lamports;
  if (typeof raw !== 'string') return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

async function setRevenueCursorLamports(value: bigint): Promise<void> {
  await atelierClient.execute({
    sql: `INSERT INTO staking_revenue_cursor (id, cumulative_lamports, updated_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            cumulative_lamports = excluded.cumulative_lamports,
            updated_at = CURRENT_TIMESTAMP`,
    args: [REVENUE_CURSOR_ID, value.toString()],
  });
}

function anchorDiscriminator(ixName: string): Buffer {
  return createHash('sha256').update(`global:${ixName}`).digest().subarray(0, 8);
}

interface EpochRevenue {
  revenueLamports: bigint;
  cumulativeLamports: bigint;
  baseline: boolean;
  fromFeed: boolean;
}

/**
 * Platform revenue (lamports) attributable to the epoch just ended.
 *
 * Source: pump.fun creator-fee income, indexed in lamports (SOL) by
 * `fee-indexer.ts` as a CUMULATIVE all-time total. Per-epoch revenue is the DELTA
 * since the last funding run (a lamports cursor in `staking_revenue_cursor`);
 * the on-chain drip then vests it. Fees and rewards are both SOL, so no price
 * conversion happens anywhere.
 *
 * - Baseline: on the first run no cursor exists. We report `baseline` and set the
 *   cursor to the current cumulative WITHOUT distributing the historical backlog;
 *   accrual starts from launch.
 * - Carry-over: the cursor only advances on a successful fund, so revenue earned
 *   while the pool is empty or the treasury is short rolls into the next epoch
 *   instead of being lost.
 * - Rounding floors in the vault's favor (never distributes more than was earned).
 *
 * `STAKING_EPOCH_REVENUE_SOL` (SOL) wins as a manual override for
 * bootstrap/testing and bypasses the feed cursor entirely.
 */
async function getEpochRevenueLamports(): Promise<EpochRevenue> {
  const manual = process.env.STAKING_EPOCH_REVENUE_SOL;
  if (manual) {
    const parsed = Number(manual);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return {
        revenueLamports: BigInt(Math.floor(parsed * Number(LAMPORTS_PER_SOL))),
        cumulativeLamports: 0n,
        baseline: false,
        fromFeed: false,
      };
    }
  }

  const cumulativeLamports = BigInt(Math.trunc(await getTotalIndexedWithdrawals()));
  const cursor = await getRevenueCursorLamports();
  if (cursor === null) {
    return { revenueLamports: 0n, cumulativeLamports, baseline: true, fromFeed: true };
  }

  const deltaLamports = cumulativeLamports > cursor ? cumulativeLamports - cursor : 0n;
  return {
    revenueLamports: deltaLamports,
    cumulativeLamports,
    baseline: false,
    fromFeed: true,
  };
}

export interface StakingEpochBudget {
  budget: bigint;
  revenue: bigint;
  shareBps: number;
  feed: { cumulativeLamports: bigint; baseline: boolean } | null;
}

/**
 * Lamports to distribute this epoch. An explicit STAKING_EPOCH_SOL override
 * wins (bootstrap/manual top-ups); otherwise it is `shareBps` of epoch revenue.
 * `feed` is non-null only in feed mode and carries the lamports cursor the caller
 * advances after a successful fund (or sets as the baseline on the first run).
 */
export async function computeStakingEpochBudgetLamports(): Promise<StakingEpochBudget> {
  const override = process.env.STAKING_EPOCH_SOL;
  if (override) {
    const parsed = Number(override);
    if (Number.isFinite(parsed) && parsed > 0) {
      return {
        budget: BigInt(Math.floor(parsed * Number(LAMPORTS_PER_SOL))),
        revenue: 0n,
        shareBps: 0,
        feed: null,
      };
    }
  }
  const rawShare = Number(process.env.STAKING_REWARD_SHARE_BPS ?? DEFAULT_SHARE_BPS);
  const shareBps =
    Number.isFinite(rawShare) && rawShare >= 0 && rawShare <= 10_000
      ? Math.floor(rawShare)
      : DEFAULT_SHARE_BPS;
  const epoch = await getEpochRevenueLamports();
  const budget = (epoch.revenueLamports * BigInt(shareBps)) / 10_000n;
  return {
    budget,
    revenue: epoch.revenueLamports,
    shareBps,
    feed: epoch.fromFeed
      ? { cumulativeLamports: epoch.cumulativeLamports, baseline: epoch.baseline }
      : null,
  };
}

async function recentlyFunded(): Promise<boolean> {
  const rows = await atelierClient.execute(
    `SELECT created_at FROM staking_reward_funding_sol ORDER BY created_at DESC LIMIT 1`,
  );
  if (rows.rows.length === 0) return false;
  const last = rows.rows[0].created_at;
  if (typeof last !== 'string') return false;
  // SQLite CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" (space, UTC). Normalize to
  // ISO so Date.parse is reliable; on an unparseable value, fail SAFE (treat as
  // recently funded) so a parse glitch can never trigger a double-funding.
  const lastMs = Date.parse(`${last.replace(' ', 'T')}Z`);
  if (Number.isNaN(lastMs)) return true;
  return Date.now() - lastMs < MIN_FUNDING_INTERVAL_SECS * 1000;
}

export interface FundingResult {
  status: 'funded' | 'skipped' | 'uncertain';
  reason?: string;
  amountLamports?: string;
  transferSig?: string;
  crankSig?: string;
}

function buildCrankSyncIx(
  funder: PublicKey,
  pool: PublicKey,
  rewardVault: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: STAKING_PROGRAM_ID,
    keys: [
      { pubkey: funder, isSigner: true, isWritable: false },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: rewardVault, isSigner: false, isWritable: false },
    ],
    data: anchorDiscriminator('crank_sync'),
  });
}

/**
 * Fund + crank the staking pool for the current epoch. Idempotent within
 * MIN_FUNDING_INTERVAL_SECS. Returns a skip (not a throw) for the no-op cases so
 * the cron stays green.
 */
export async function fundStakingRewards(): Promise<FundingResult> {
  await initStakingRewardsDb();

  // Serialize concurrent invocations (scheduled cron vs manual trigger vs Vercel
  // retry). Without this, two runs both pass recentlyFunded() -- which is written
  // last -- and double-fund.
  if (!(await acquireFundingLock())) {
    return { status: 'skipped', reason: 'another funding run holds the lock' };
  }
  try {
    return await fundStakingRewardsLocked();
  } finally {
    await releaseFundingLock();
  }
}

async function fundStakingRewardsLocked(): Promise<FundingResult> {
  if (await recentlyFunded()) {
    return { status: 'skipped', reason: 'already funded this interval' };
  }

  const { budget, revenue, shareBps, feed } = await computeStakingEpochBudgetLamports();

  if (feed?.baseline) {
    await setRevenueCursorLamports(feed.cumulativeLamports);
    return { status: 'skipped', reason: 'revenue cursor baseline established' };
  }

  if (budget <= 0n) {
    return { status: 'skipped', reason: 'zero budget' };
  }
  // Reject an implausibly large budget rather than send it: a fat-fingered
  // override, or the entire frozen-cursor backlog surfacing as one delta after an
  // override is removed, should surface as an error -- not a lump distribution.
  const maxEpoch = maxEpochLamports();
  if (budget > maxEpoch) {
    return {
      status: 'skipped',
      reason: `budget ${budget} exceeds per-epoch cap ${maxEpoch} (STAKING_MAX_EPOCH_SOL) -- raise the cap or check overrides/cursor`,
    };
  }

  const connection = getServerConnection();
  const payer = getAtelierKeypair();
  const [pool] = findPoolPda();
  const [rewardVault] = findRewardVaultPda(pool);

  const poolAccount = await fetchPool(connection);
  if (!poolAccount) {
    return { status: 'skipped', reason: 'pool not initialized on-chain' };
  }
  // crank_sync is gated to pool.funder on-chain; the treasury wallet must be it.
  if (!poolAccount.funder.equals(payer.publicKey)) {
    return {
      status: 'skipped',
      reason: `treasury ${payer.publicKey.toBase58()} is not the pool funder ${poolAccount.funder.toBase58()}`,
    };
  }
  // Don't fund a pool with no staked weight: rewards drip over time and the
  // accumulator does not advance while total_weight == 0, so a tranche funded now
  // would drip to nobody and (there being no admin sweep on-chain) strand
  // permanently in the vault. Wait for real stake.
  if (poolAccount.totalWeight === 0n) {
    return {
      status: 'skipped',
      reason: 'no active stake weight -- not funding an empty pool',
    };
  }

  const treasuryLamports = BigInt(await connection.getBalance(payer.publicKey));
  if (treasuryLamports < budget + TREASURY_GAS_RESERVE_LAMPORTS) {
    return {
      status: 'skipped',
      reason: `treasury ${treasuryLamports} lamports < budget ${budget} + gas reserve`,
    };
  }

  // Wrap the SOL tranche straight into the wSOL reward vault: a native transfer
  // followed by SyncNative credits the vault's token amount by exactly `budget`.
  const transferIx = SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: rewardVault,
    lamports: budget,
  });
  const syncIx = createSyncNativeInstruction(rewardVault);
  const crankIx = buildCrankSyncIx(payer.publicKey, pool, rewardVault);

  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.add(transferIx, syncIx, crankIx);
  tx.sign(payer);
  if (!tx.signature) {
    return { status: 'skipped', reason: 'failed to sign funding transaction' };
  }
  const sig = bs58.encode(tx.signature);

  // Commit the idempotency guards BEFORE broadcasting -- the audit row (which
  // recentlyFunded() reads) and the feed cursor. This is the treasury-safe
  // direction: if the tx lands but confirmation times out, no run will re-send
  // it. The cost is that a genuinely-dropped tx skips this epoch's revenue
  // (recoverable via a manual STAKING_EPOCH_REVENUE_SOL top-up) rather than
  // risking a double-pay of real SOL.
  const id = `stkfund_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  await atelierClient.execute({
    sql: `INSERT INTO staking_reward_funding_sol
      (id, amount_lamports, transfer_sig, crank_sig, revenue_lamports, share_bps)
      VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, budget.toString(), sig, sig, revenue.toString(), shareBps],
  });
  if (feed) {
    await setRevenueCursorLamports(feed.cumulativeLamports);
  }

  await connection.sendRawTransaction(tx.serialize());
  try {
    await pollTransactionConfirmation(connection, sig);
  } catch {
    // Landed-but-unconfirmed vs dropped are indistinguishable here. One
    // reconciliation query (searches recent history) resolves the common case;
    // if still unknown, report uncertain and leave the guards committed so no
    // re-send happens. An operator reconciles from the sig.
    const status = await connection.getSignatureStatus(sig, {
      searchTransactionHistory: true,
    });
    const confirmed =
      status.value?.confirmationStatus === 'confirmed' ||
      status.value?.confirmationStatus === 'finalized';
    if (!(confirmed && !status.value?.err)) {
      return {
        status: 'uncertain',
        reason: 'funding tx sent but not confirmed -- verify on-chain before re-funding',
        amountLamports: budget.toString(),
        transferSig: sig,
        crankSig: sig,
      };
    }
  }

  return {
    status: 'funded',
    amountLamports: budget.toString(),
    transferSig: sig,
    crankSig: sig,
  };
}
