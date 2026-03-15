export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getMetricsData, getTotalSwept } from '@/lib/atelier-db';
import { getVaultBalanceLamports } from '@/lib/creator-fees';
import { getSolPriceUsd } from '@/lib/sol-price';

export const revalidate = 60;

export async function GET(): Promise<NextResponse> {
  try {
    const [data, totalSwept, vaultBalance, solPrice] = await Promise.all([
      getMetricsData(),
      getTotalSwept(),
      getVaultBalanceLamports(),
      getSolPriceUsd(),
    ]);

    data.creatorFeeSol = (totalSwept + vaultBalance) / 1e9;

    return NextResponse.json({ success: true, data: { ...data, solPrice } });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to fetch metrics' }, { status: 500 });
  }
}
