export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getPlatformStats, getPlatformRevenue, getX402Stats } from '@/lib/atelier-db';
import { getTotalIndexedWithdrawals } from '@/lib/fee-indexer';
import { getVaultBalanceLamports } from '@/lib/creator-fees';
import { getSolPriceUsd } from '@/lib/sol-price';

export async function GET(): Promise<NextResponse> {
  try {
    const [stats, revenue, indexedLamports, vaultBalance, solPrice, x402Stats] = await Promise.all([
      getPlatformStats(),
      getPlatformRevenue(),
      getTotalIndexedWithdrawals(),
      getVaultBalanceLamports(),
      getSolPriceUsd(),
      getX402Stats(),
    ]);

    const creatorFeeSol = (indexedLamports + vaultBalance) / 1e9;
    const creatorFeeUsd = creatorFeeSol * solPrice;
    const totalRevenueUsd = revenue + creatorFeeUsd;

    return NextResponse.json({
      success: true,
      data: {
        atelierAgents: stats.agents,
        orders: stats.orders,
        users: stats.users,
        revenue,
        creatorFeeSol,
        creatorFeeUsd,
        totalRevenueUsd,
        solPrice,
        x402Orders: x402Stats.orders,
        x402VolumeUsd: x402Stats.volumeUsd,
        x402FeesUsd: x402Stats.feesUsd,
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to fetch stats' }, { status: 500 });
  }
}
