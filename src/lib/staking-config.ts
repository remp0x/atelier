import { PublicKey } from '@solana/web3.js';
import { ATELIER_TOKEN_MINT } from './solana-token-balance';

/**
 * Shared (client + server) configuration for the atelier-staking on-chain
 * program. PDA derivation and tier metadata live here so they cannot drift
 * between the UI, the funding cron, and the program. The on-chain program is
 * the source of truth; these are mirrors that must match `solana/` constants.
 */

export const STAKING_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_STAKING_PROGRAM_ID ||
    'Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS',
);

export const STAKED_MINT = ATELIER_TOKEN_MINT;
/** Rewards are paid in SOL (wrapped SOL vault; claims auto-unwrap to native). */
export const REWARD_MINT = new PublicKey('So11111111111111111111111111111111111111112');
export const REWARD_DECIMALS = 9;

/**
 * Pool instance for the staked mint (part of the pool PDA seeds). Pool 1 is the
 * live SOL-rewards pool; the retired pool (pre-pool_id layout) is unreachable
 * by the current program.
 */
export const STAKING_POOL_ID = Number(process.env.NEXT_PUBLIC_STAKING_POOL_ID ?? '1');

export const POOL_SEED = Buffer.from('pool');
export const STAKED_VAULT_SEED = Buffer.from('staked_vault');
export const REWARD_VAULT_SEED = Buffer.from('reward_vault');
export const POSITION_SEED = Buffer.from('position');

export const BPS_DENOM = 10_000;
/** Matches ACC_SCALE in the program (1e18). */
export const ACC_SCALE = 1_000_000_000_000_000_000n;

const DAY = 24 * 60 * 60;

export interface StakingTier {
  index: number;
  label: string;
  durationSecs: number;
  multiplierBps: number;
  /** Human multiplier for display, e.g. "4x". */
  multiplierLabel: string;
}

/** Aggressive tiers: 15-day 1x, 30-day 4x, 60-day 10x, 180-day 20x. */
export const STAKING_TIERS: readonly StakingTier[] = [
  { index: 0, label: '15-day lock', durationSecs: 15 * DAY, multiplierBps: 10_000, multiplierLabel: '1x' },
  { index: 1, label: '30-day lock', durationSecs: 30 * DAY, multiplierBps: 40_000, multiplierLabel: '4x' },
  { index: 2, label: '60-day lock', durationSecs: 60 * DAY, multiplierBps: 100_000, multiplierLabel: '10x' },
  { index: 3, label: '180-day lock', durationSecs: 180 * DAY, multiplierBps: 200_000, multiplierLabel: '20x' },
];

export function getTier(index: number): StakingTier {
  const tier = STAKING_TIERS[index];
  if (!tier) throw new Error(`Unknown staking tier index: ${index}`);
  return tier;
}

export function findPoolPda(
  stakedMint: PublicKey = STAKED_MINT,
  poolId: number = STAKING_POOL_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [POOL_SEED, stakedMint.toBuffer(), Buffer.from([poolId])],
    STAKING_PROGRAM_ID,
  );
}

export function findStakedVaultPda(pool: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [STAKED_VAULT_SEED, pool.toBuffer()],
    STAKING_PROGRAM_ID,
  );
}

export function findRewardVaultPda(pool: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [REWARD_VAULT_SEED, pool.toBuffer()],
    STAKING_PROGRAM_ID,
  );
}

export function findPositionPda(
  pool: PublicKey,
  owner: PublicKey,
  tierIndex: number,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [POSITION_SEED, pool.toBuffer(), owner.toBuffer(), Buffer.from([tierIndex])],
    STAKING_PROGRAM_ID,
  );
}

/**
 * Project the reward accumulator forward for rewards that have dripped since the
 * pool was last touched on-chain (mirror of the program's `update_rewards`).
 * The on-chain `acc_reward_per_weight` only advances on an interaction, so the
 * UI must project it to show live claimable. Returns the stored value unchanged
 * when nothing has dripped (no weight, or already past `period_finish`).
 */
export function projectAccRewardPerWeight(
  pool: {
    accRewardPerWeight: bigint;
    rewardRate: bigint;
    periodFinish: bigint;
    lastUpdateTime: bigint;
    totalWeight: bigint;
  },
  nowSecs: number,
): bigint {
  if (pool.totalWeight === 0n) return pool.accRewardPerWeight;
  const now = BigInt(Math.floor(nowSecs));
  const applicable = now < pool.periodFinish ? now : pool.periodFinish;
  if (applicable <= pool.lastUpdateTime) return pool.accRewardPerWeight;
  const elapsed = applicable - pool.lastUpdateTime;
  return pool.accRewardPerWeight + (pool.rewardRate * elapsed) / pool.totalWeight;
}

/**
 * Mirror of the on-chain settle math: reward lamports owed to a position given the current
 * accumulator. `weight = amount * multiplierBps / BPS_DENOM`. Pass an accumulator
 * projected via `projectAccRewardPerWeight` for live (drip-aware) display.
 */
export function computeClaimable(params: {
  weight: bigint;
  rewardDebt: bigint;
  pendingReward: bigint;
  accRewardPerWeight: bigint;
}): bigint {
  const accumulated = (params.weight * params.accRewardPerWeight) / ACC_SCALE;
  const fresh = accumulated > params.rewardDebt ? accumulated - params.rewardDebt : 0n;
  return params.pendingReward + fresh;
}

export function weightFor(amount: bigint, tierIndex: number): bigint {
  const tier = getTier(tierIndex);
  return (amount * BigInt(tier.multiplierBps)) / BigInt(BPS_DENOM);
}
