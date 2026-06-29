export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAccount, getMint, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { getServerConnection } from '@/lib/solana-server';
import { ATELIER_TOKEN_MINT } from '@/lib/solana-token-balance';
import { fetchPool, fetchAllPositions } from '@/lib/staking-program';
import { findPoolPda, findRewardVaultPda, STAKING_TIERS } from '@/lib/staking-config';

interface TierStat {
  tier: number;
  label: string;
  multiplierLabel: string;
  positions: number;
  staked: string;
}

interface StakingStats {
  initialized: boolean;
  atelierDecimals: number;
  usdcDecimals: number;
  tvlStaked: string;
  weightedTvl: string;
  stakers: number;
  positions: number;
  totalRewardsDistributed: string;
  totalRewardsClaimed: string;
  rewardVaultBalance: string;
  paused: boolean;
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
      usdcDecimals: 6,
      tvlStaked: '0',
      weightedTvl: '0',
      stakers: 0,
      positions: 0,
      totalRewardsDistributed: '0',
      totalRewardsClaimed: '0',
      rewardVaultBalance: '0',
      paused: false,
      tiers: STAKING_TIERS.map((t) => ({
        tier: t.index,
        label: t.label,
        multiplierLabel: t.multiplierLabel,
        positions: 0,
        staked: '0',
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

  return {
    initialized: true,
    atelierDecimals,
    usdcDecimals: 6,
    tvlStaked: pool.totalStaked.toString(),
    weightedTvl: pool.totalWeight.toString(),
    stakers: owners.size,
    positions: positions.length,
    totalRewardsDistributed: pool.totalRewardsDistributed.toString(),
    totalRewardsClaimed: pool.totalRewardsClaimed.toString(),
    rewardVaultBalance: rewardVaultBalance.toString(),
    paused: pool.paused,
    tiers: STAKING_TIERS.map((t) => ({
      tier: t.index,
      label: t.label,
      multiplierLabel: t.multiplierLabel,
      positions: tierCount.get(t.index) ?? 0,
      staked: (tierStaked.get(t.index) ?? 0n).toString(),
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
