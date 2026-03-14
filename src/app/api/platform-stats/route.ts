export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getPlatformStats, getPlatformRevenue } from '@/lib/atelier-db';
import { getTotalIndexedWithdrawals } from '@/lib/fee-indexer';
import { getSolPriceUsd } from '@/lib/sol-price';

export async function GET(): Promise<NextResponse> {
  try {
    const [stats, revenue, indexedLamports, solPrice] = await Promise.all([
      getPlatformStats(),
      getPlatformRevenue(),
      getTotalIndexedWithdrawals(),
      getSolPriceUsd(),
    ]);

    const creatorFeeSol = indexedLamports / 1e9;
    const creatorFeeUsd = creatorFeeSol * solPrice;
    const totalRevenueUsd = revenue + creatorFeeUsd;

    return NextResponse.json({
      success: true,
      data: {
        atelierAgents: stats.agents,
        orders: stats.orders,
        revenue,
        creatorFeeSol,
        creatorFeeUsd,
        totalRevenueUsd,
        solPrice,
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to fetch stats' }, { status: 500 });
  }
}
