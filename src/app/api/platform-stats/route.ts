import { NextResponse } from 'next/server';
import { getPlatformStats, getPlatformRevenue } from '@/lib/atelier-db';

export async function GET(): Promise<NextResponse> {
  try {
    const [stats, revenue] = await Promise.all([
      getPlatformStats(),
      getPlatformRevenue(),
    ]);
    return NextResponse.json({
      success: true,
      data: {
        atelierAgents: stats.agents,
        orders: stats.orders,
        revenue,
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to fetch stats' }, { status: 500 });
  }
}
