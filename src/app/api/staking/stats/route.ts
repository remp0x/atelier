export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAccount, getMint, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { getServerConnection } from '@/lib/solana-server';
import { ATELIER_TOKEN_MINT } from '@/lib/solana-token-balance';
import { fetchPool, fetchAllPositions } from '@/lib/staking-program';
import {
  findPoolPda,
  findRewardVaultPda,
  STAKING_TIERS,
  REWARD_DECIMALS,
  estimateTierAprPercent,
} from '@/lib/staking-config';
import { getSolPriceUsd } from '@/lib/sol-price';
import { getMarketData } from '@/lib/market-data';

interface TierStat {
  tier: number;
  label: string;
  multiplierLabel: string;
  positions: number;
  staked: string;
  /** Estimated APR for this tier, in percent; null when it can't be computed
   *  (no active drip, no staked weight, or a missing price). */
  aprPercent: number | null;
}

interface StakingStats {
  initialized: boolean;
  atelierDecimals: number;
  rewardDecimals: number;
  tvlStaked: string;
  weightedTvl: string;
  stakers: number;
  positions: number;
  totalRewardsDistributed: string;
  totalRewardsClaimed: string;
  rewardVaultBalance: string;
  paused: boolean;
  /** True while a reward drip is live (rate > 0, weight > 0, before period end).
   *  APRs are only meaningful, and only populated, while this holds. */
  aprLive: boolean;
  tiers: TierStat[];
}

let cache: { data: StakingStats; ts: number } | null = null;
const CACHE_TTL_MS = 30_000;
let cachedDecimals: number | null = null;

async function getAtelierDecimals(): Promise<number> {
  if (cachedDecimals !== null) return cachedDecimals;
  const connection = getServerConnection();
  const mint = await getMint(connection, ATELIER_TOKEN_MINT, 'confirmed', TOKEN_2022_PROGRAM_ID);
  cachedDecimals = mint.decimals;
  return cachedDecimals;
}

async function computeStats(): Promise<StakingStats> {
  const connection = getServerConnection();
  const atelierDecimals = await getAtelierDecimals();

  const pool = await fetchPool(connection);
  if (!pool) {
    return {
      initialized: false,
      atelierDecimals,
      rewardDecimals: REWARD_DECIMALS,
      tvlStaked: '0',
      weightedTvl: '0',
      stakers: 0,
      positions: 0,
      totalRewardsDistributed: '0',
      totalRewardsClaimed: '0',
      rewardVaultBalance: '0',
      paused: false,
      aprLive: false,
      tiers: STAKING_TIERS.map((t) => ({
        tier: t.index,
        label: t.label,
        multiplierLabel: t.multiplierLabel,
        positions: 0,
        staked: '0',
        aprPercent: null,
      })),
    };
  }

  const positions = await fetchAllPositions(connection);
  const owners = new Set(positions.map((p) => p.owner.toBase58()));

  const tierStaked = new Map<number, bigint>();
  const tierCount = new Map<number, number>();
  for (const p of positions) {
    tierStaked.set(p.tierIndex, (tierStaked.get(p.tierIndex) ?? 0n) + p.amount);
    tierCount.set(p.tierIndex, (tierCount.get(p.tierIndex) ?? 0) + 1);
  }

  const [poolPda] = findPoolPda();
  const [rewardVault] = findRewardVaultPda(poolPda);
  let rewardVaultBalance = 0n;
  try {
    const acct = await getAccount(connection, rewardVault);
    rewardVaultBalance = acct.amount;
  } catch {
    rewardVaultBalance = 0n;
  }

  // APR is only meaningful while a drip is live. When it is, price both assets
  // (SOL for the reward, ATELIER for the stake) and derive a per-tier estimate.
  const nowSecs = Math.floor(Date.now() / 1000);
  const aprLive =
    pool.rewardRate > 0n &&
    pool.totalWeight > 0n &&
    Number(pool.periodFinish) > nowSecs;

  let solPriceUsd = 0;
  let atelierPriceUsd = 0;
  if (aprLive) {
    const mint = ATELIER_TOKEN_MINT.toBase58();
    const [sol, market] = await Promise.all([
      getSolPriceUsd().catch(() => 0),
      getMarketData([mint]).catch(() => ({}) as Record<string, { price_usd: number } | null>),
    ]);
    solPriceUsd = sol;
    atelierPriceUsd = market[mint]?.price_usd ?? 0;
  }

  const tierApr = (multiplierBps: number): number | null =>
    aprLive
      ? estimateTierAprPercent({
          rewardRate: pool.rewardRate,
          totalWeight: pool.totalWeight,
          tierMultiplierBps: multiplierBps,
          solPriceUsd,
          atelierPriceUsd,
        })
      : null;

  return {
    initialized: true,
    atelierDecimals,
    rewardDecimals: REWARD_DECIMALS,
    tvlStaked: pool.totalStaked.toString(),
    weightedTvl: pool.totalWeight.toString(),
    stakers: owners.size,
    positions: positions.length,
    totalRewardsDistributed: pool.totalRewardsDistributed.toString(),
    totalRewardsClaimed: pool.totalRewardsClaimed.toString(),
    rewardVaultBalance: rewardVaultBalance.toString(),
    paused: pool.paused,
    aprLive,
    tiers: STAKING_TIERS.map((t) => ({
      tier: t.index,
      label: t.label,
      multiplierLabel: t.multiplierLabel,
      positions: tierCount.get(t.index) ?? 0,
      staked: (tierStaked.get(t.index) ?? 0n).toString(),
      aprPercent: tierApr(t.multiplierBps),
    })),
  };
}

export async function GET(): Promise<NextResponse> {
  try {
    if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
      return NextResponse.json({ success: true, data: cache.data });
    }
    const data = await computeStats();
    cache = { data, ts: Date.now() };
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
