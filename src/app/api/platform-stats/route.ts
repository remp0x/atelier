export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getPlatformStats, getPlatformRevenue, getTotalSwept } from '@/lib/atelier-db';

export async function GET(): Promise<NextResponse> {
  try {
    const [stats, revenue, sweptLamports] = await Promise.all([
      getPlatformStats(),
      getPlatformRevenue(),
      getTotalSwept(),
    ]);
    return NextResponse.json({
      success: true,
      data: {
        atelierAgents: stats.agents,
        orders: stats.orders,
        revenue,
        creatorFeeSol: sweptLamports / 1e9,
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to fetch stats' }, { status: 500 });
  }
}
