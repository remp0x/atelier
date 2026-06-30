import { createHash } from 'crypto';
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
  createTransferCheckedInstruction,
} from '@solana/spl-token';
import { atelierClient, getTotalIndexedWithdrawals } from './atelier-db';
import {
  getAtelierKeypair,
  getServerConnection,
  pollTransactionConfirmation,
} from './solana-server';
import { USDC_MINT } from './solana-pay';
import {
  STAKING_PROGRAM_ID,
  findPoolPda,
  findRewardVaultPda,
} from './staking-config';
import { fetchPool } from './staking-program';
import { getSolPriceUsd } from './sol-price';

/**
 * Server-side reward funding for atelier-staking.
 *
 * The on-chain program is the source of truth for balances; this module only
 * (1) decides how much USDC to distribute this epoch, (2) transfers it from the
 * Atelier treasury wallet into the pool's reward vault, and (3) cranks the
 * accumulator so stakers' claimable balances reflect it. Every run is recorded
 * for audit and idempotency.
 */

const USDC_DECIMALS = 6;
const DEFAULT_SHARE_BPS = 5000; // 50% of creator-fee revenue to stakers
const MIN_FUNDING_INTERVAL_SECS = 6 * 24 * 60 * 60; // weekly cadence, 1-day slack
const LAMPORTS_PER_SOL = 1_000_000_000n;
const REVENUE_CURSOR_ID = 'creator_fees';

let initialized = false;

async function initStakingRewardsDb(): Promise<void> {
  if (initialized) return;
  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS staking_reward_funding (
      id TEXT PRIMARY KEY,
      amount_micro_usdc INTEGER NOT NULL,
      transfer_sig TEXT,
      crank_sig TEXT,
      revenue_micro_usdc INTEGER NOT NULL DEFAULT 0,
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
  initialized = true;
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
  revenueMicroUsdc: bigint;
  cumulativeLamports: bigint;
  baseline: boolean;
  fromFeed: boolean;
}

/**
 * Platform revenue (micro-USDC) attributable to the epoch just ended.
 *
 * Source: pump.fun creator-fee income, indexed in lamports (SOL) by
 * `fee-indexer.ts` as a CUMULATIVE all-time total. Per-epoch revenue is the DELTA
 * since the last funding run (a lamports cursor in `staking_revenue_cursor`),
 * converted to USDC at the current SOL price; the on-chain drip then vests it.
 *
 * - Baseline: on the first run no cursor exists. We report `baseline` and set the
 *   cursor to the current cumulative WITHOUT distributing the historical backlog;
 *   accrual starts from launch.
 * - Carry-over: the cursor only advances on a successful fund, so revenue earned
 *   while the pool is empty, the treasury is short, or the SOL price is briefly
 *   unavailable rolls into the next epoch instead of being lost.
 * - Rounding floors in the vault's favor (never distributes more than was earned).
 *
 * `STAKING_EPOCH_REVENUE_USDC` (already-USDC) still wins as a manual override for
 * bootstrap/testing and bypasses the feed cursor entirely.
 */
async function getEpochRevenueMicroUsdc(): Promise<EpochRevenue> {
  const manual = process.env.STAKING_EPOCH_REVENUE_USDC;
  if (manual) {
    const parsed = Number(manual);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return {
        revenueMicroUsdc: BigInt(Math.floor(parsed * 10 ** USDC_DECIMALS)),
        cumulativeLamports: 0n,
        baseline: false,
        fromFeed: false,
      };
    }
  }

  const cumulativeLamports = BigInt(Math.trunc(await getTotalIndexedWithdrawals()));
  const cursor = await getRevenueCursorLamports();
  if (cursor === null) {
    return { revenueMicroUsdc: 0n, cumulativeLamports, baseline: true, fromFeed: true };
  }

  const deltaLamports = cumulativeLamports > cursor ? cumulativeLamports - cursor : 0n;
  if (deltaLamports === 0n) {
    return { revenueMicroUsdc: 0n, cumulativeLamports, baseline: false, fromFeed: true };
  }

  const solPriceUsd = await getSolPriceUsd();
  if (!(solPriceUsd > 0)) {
    return { revenueMicroUsdc: 0n, cumulativeLamports, baseline: false, fromFeed: true };
  }
  const priceMicroUsdPerSol = BigInt(Math.floor(solPriceUsd * 10 ** USDC_DECIMALS));
  const revenueMicroUsdc = (deltaLamports * priceMicroUsdPerSol) / LAMPORTS_PER_SOL;
  return { revenueMicroUsdc, cumulativeLamports, baseline: false, fromFeed: true };
}

export interface StakingEpochBudget {
  budget: bigint;
  revenue: bigint;
  shareBps: number;
  feed: { cumulativeLamports: bigint; baseline: boolean } | null;
}

/**
 * USDC (micro) to distribute this epoch. An explicit STAKING_EPOCH_USDC override
 * wins (bootstrap/manual top-ups); otherwise it is `shareBps` of epoch revenue.
 * `feed` is non-null only in feed mode and carries the lamports cursor the caller
 * advances after a successful fund (or sets as the baseline on the first run).
 */
export async function computeStakingEpochBudgetMicroUsdc(): Promise<StakingEpochBudget> {
  const override = process.env.STAKING_EPOCH_USDC;
  if (override) {
    const parsed = Number(override);
    if (Number.isFinite(parsed) && parsed > 0) {
      return {
        budget: BigInt(Math.floor(parsed * 10 ** USDC_DECIMALS)),
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
  const epoch = await getEpochRevenueMicroUsdc();
  const budget = (epoch.revenueMicroUsdc * BigInt(shareBps)) / 10_000n;
  return {
    budget,
    revenue: epoch.revenueMicroUsdc,
    shareBps,
    feed: epoch.fromFeed
      ? { cumulativeLamports: epoch.cumulativeLamports, baseline: epoch.baseline }
      : null,
  };
}

async function recentlyFunded(): Promise<boolean> {
  const rows = await atelierClient.execute(
    `SELECT created_at FROM staking_reward_funding ORDER BY created_at DESC LIMIT 1`,
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
  status: 'funded' | 'skipped';
  reason?: string;
  amountMicroUsdc?: string;
  transferSig?: string;
  crankSig?: string;
}

function buildCrankSyncIx(pool: PublicKey, rewardVault: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: STAKING_PROGRAM_ID,
    keys: [
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

  if (await recentlyFunded()) {
    return { status: 'skipped', reason: 'already funded this interval' };
  }

  const { budget, revenue, shareBps, feed } = await computeStakingEpochBudgetMicroUsdc();

  if (feed?.baseline) {
    await setRevenueCursorLamports(feed.cumulativeLamports);
    return { status: 'skipped', reason: 'revenue cursor baseline established' };
  }

  if (budget <= 0n) {
    return { status: 'skipped', reason: 'zero budget' };
  }

  const connection = getServerConnection();
  const payer = getAtelierKeypair();
  const [pool] = findPoolPda();
  const [rewardVault] = findRewardVaultPda(pool);

  const poolAccount = await fetchPool(connection);
  if (!poolAccount) {
    return { status: 'skipped', reason: 'pool not initialized on-chain' };
  }
  // Don't fund a pool with no staked weight: rewards drip over time and the
  // accumulator does not advance while total_weight == 0, so a tranche funded now
  // would partly drip to nobody (wasted). Wait for real stake. (JIT/monopoly
  // capture itself is handled on-chain by the linear drip.)
  if (poolAccount.totalWeight === 0n) {
    return {
      status: 'skipped',
      reason: 'no active stake weight -- not funding an empty pool',
    };
  }

  const sourceAta = await getAssociatedTokenAddress(USDC_MINT, payer.publicKey);
  const source = await getAccount(connection, sourceAta);
  if (source.amount < budget) {
    return {
      status: 'skipped',
      reason: `treasury USDC ${source.amount} < budget ${budget}`,
    };
  }

  const transferIx = createTransferCheckedInstruction(
    sourceAta,
    USDC_MINT,
    rewardVault,
    payer.publicKey,
    budget,
    USDC_DECIMALS,
    [],
    TOKEN_PROGRAM_ID,
  );
  const crankIx = buildCrankSyncIx(pool, rewardVault);

  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.add(transferIx, crankIx);
  tx.sign(payer);

  const sig = await connection.sendRawTransaction(tx.serialize());
  await pollTransactionConfirmation(connection, sig);

  // Advance the feed cursor BEFORE the audit row: the transfer is irreversible, so
  // the cursor (cross-run idempotency for the feed) is the tighter guard -- if the
  // audit insert later fails, the next run still sees delta 0 and won't re-fund.
  if (feed) {
    await setRevenueCursorLamports(feed.cumulativeLamports);
  }

  const id = `stkfund_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  await atelierClient.execute({
    sql: `INSERT INTO staking_reward_funding
      (id, amount_micro_usdc, transfer_sig, crank_sig, revenue_micro_usdc, share_bps)
      VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, budget.toString(), sig, sig, revenue.toString(), shareBps],
  });

  return {
    status: 'funded',
    amountMicroUsdc: budget.toString(),
    transferSig: sig,
    crankSig: sig,
  };
}
