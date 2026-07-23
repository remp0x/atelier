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

const SECONDS_PER_YEAR = 31_536_000;
const ATELIER_DECIMALS = 6;
const SOL_DECIMALS = 9;

/**
 * Estimated annual percentage rate for a tier, in percent (e.g. 42.5 for 42.5%).
 *
 * A position of `A` tokens in a tier of multiplier `m` has weight `A*m` and earns
 * `weight * rewardRate / (totalWeight * ACC_SCALE)` reward base units per second;
 * the position size `A` cancels, leaving an APR that depends only on the tier
 * multiplier, the live drip rate, total staked weight, and the two token prices.
 * It scales linearly with the tier multiplier and falls as `totalWeight` grows
 * (more stakers dilute the same drip).
 *
 * This is an ESTIMATE: `rewardRate` reflects only the current drip window (funded
 * from variable weekly revenue), so annualizing it assumes that rate persists.
 * Returns null when it cannot be computed (no active drip, no weight, or a
 * missing/zero price).
 */
export function estimateTierAprPercent(params: {
  rewardRate: bigint;
  totalWeight: bigint;
  tierMultiplierBps: number;
  solPriceUsd: number;
  atelierPriceUsd: number;
}): number | null {
  const { rewardRate, totalWeight, tierMultiplierBps, solPriceUsd, atelierPriceUsd } = params;
  if (rewardRate <= 0n || totalWeight <= 0n) return null;
  if (!(solPriceUsd > 0) || !(atelierPriceUsd > 0)) return null;

  const rate = Number(rewardRate);
  const tw = Number(totalWeight);
  const accScale = Number(ACC_SCALE);
  const m = tierMultiplierBps / BPS_DENOM;

  // annual reward (base units) per token staked in this tier:
  //   m * rate * secondsPerYear / (totalWeight * ACC_SCALE)
  // converted to USD (reward is SOL/lamports) and divided by the token's USD
  // value (ATELIER). The token/decimal factors reduce to 10^(ATELIER-SOL)=1e-3.
  const decimalFactor = 10 ** (ATELIER_DECIMALS - SOL_DECIMALS); // 1e-3
  const ratio =
    (m * rate * SECONDS_PER_YEAR * solPriceUsd * decimalFactor) /
    (tw * accScale * atelierPriceUsd);
  if (!Number.isFinite(ratio) || ratio < 0) return null;
  return ratio * 100;
}
