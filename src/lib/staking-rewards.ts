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
import { atelierClient } from './atelier-db';
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
const DEFAULT_SHARE_BPS = 2000; // 20% of platform revenue to stakers
const MIN_FUNDING_INTERVAL_SECS = 6 * 24 * 60 * 60; // weekly cadence, 1-day slack

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
  initialized = true;
}

function anchorDiscriminator(ixName: string): Buffer {
  return createHash('sha256').update(`global:${ixName}`).digest().subarray(0, 8);
}

/**
 * Platform revenue (in micro-USDC) attributable to the epoch just ended.
 *
 * TODO(staking): wire this to the live fee ledger (see fee-indexer.ts /
 * /api/fees). Until then it reads STAKING_EPOCH_REVENUE_USDC so the cron can be
 * dry-run safely and never distributes a fabricated amount: with nothing
 * configured it returns 0 and the cron no-ops.
 */
async function getEpochRevenueMicroUsdc(): Promise<bigint> {
  const configured = process.env.STAKING_EPOCH_REVENUE_USDC;
  if (!configured) return 0n;
  const parsed = Number(configured);
  if (!Number.isFinite(parsed) || parsed < 0) return 0n;
  return BigInt(Math.floor(parsed * 10 ** USDC_DECIMALS));
}

/**
 * USDC (micro) to distribute this epoch. An explicit STAKING_EPOCH_USDC override
 * wins (bootstrap/manual top-ups); otherwise it is `shareBps` of epoch revenue.
 */
export async function computeStakingEpochBudgetMicroUsdc(): Promise<{
  budget: bigint;
  revenue: bigint;
  shareBps: number;
}> {
  const override = process.env.STAKING_EPOCH_USDC;
  if (override) {
    const parsed = Number(override);
    if (Number.isFinite(parsed) && parsed > 0) {
      return {
        budget: BigInt(Math.floor(parsed * 10 ** USDC_DECIMALS)),
        revenue: 0n,
        shareBps: 0,
      };
    }
  }
  const shareBps = Number(process.env.STAKING_REWARD_SHARE_BPS || DEFAULT_SHARE_BPS);
  const revenue = await getEpochRevenueMicroUsdc();
  const budget = (revenue * BigInt(shareBps)) / 10_000n;
  return { budget, revenue, shareBps };
}

async function recentlyFunded(): Promise<boolean> {
  const rows = await atelierClient.execute(
    `SELECT created_at FROM staking_reward_funding ORDER BY created_at DESC LIMIT 1`,
  );
  if (rows.rows.length === 0) return false;
  const last = rows.rows[0].created_at;
  if (typeof last !== 'string') return false;
  const lastMs = Date.parse(`${last}Z`);
  if (Number.isNaN(lastMs)) return false;
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

  const { budget, revenue, shareBps } = await computeStakingEpochBudgetMicroUsdc();
  if (budget <= 0n) {
    return { status: 'skipped', reason: 'zero budget' };
  }

  const connection = getServerConnection();
  const payer = getAtelierKeypair();
  const [pool] = findPoolPda();
  const [rewardVault] = findRewardVaultPda(pool);

  const poolInfo = await connection.getAccountInfo(pool);
  if (!poolInfo) {
    return { status: 'skipped', reason: 'pool not initialized on-chain' };
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
