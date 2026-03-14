export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getMetricsData } from '@/lib/atelier-db';
import { getTotalIndexedWithdrawals } from '@/lib/fee-indexer';
import { getSolPriceUsd } from '@/lib/sol-price';

export const revalidate = 60;

export async function GET(): Promise<NextResponse> {
  try {
    const [data, indexedLamports, solPrice] = await Promise.all([
      getMetricsData(),
      getTotalIndexedWithdrawals(),
      getSolPriceUsd(),
    ]);

    data.creatorFeeSol = indexedLamports / 1e9;

    return NextResponse.json({ success: true, data: { ...data, solPrice } });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to fetch metrics' }, { status: 500 });
  }
}
