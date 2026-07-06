import { PublicKey } from '@solana/web3.js';
import { ATELIER_TOKEN_MINT } from './solana-token-balance';
import { USDC_MINT } from './solana-pay';

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
export const REWARD_MINT = USDC_MINT;

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

/** Moderate tiers: 30-day 1x, 90-day 4x, 180-day 8x. */
export const STAKING_TIERS: readonly StakingTier[] = [
  { index: 0, label: '30-day lock', durationSecs: 30 * DAY, multiplierBps: 10_000, multiplierLabel: '1x' },
  { index: 1, label: '90-day lock', durationSecs: 90 * DAY, multiplierBps: 40_000, multiplierLabel: '4x' },
  { index: 2, label: '180-day lock', durationSecs: 180 * DAY, multiplierBps: 80_000, multiplierLabel: '8x' },
];

export function getTier(index: number): StakingTier {
  const tier = STAKING_TIERS[index];
  if (!tier) throw new Error(`Unknown staking tier index: ${index}`);
  return tier;
}

export function findPoolPda(stakedMint: PublicKey = STAKED_MINT): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [POOL_SEED, stakedMint.toBuffer()],
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
 * Mirror of the on-chain settle math: USDC owed to a position given the current
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
