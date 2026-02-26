import { NextResponse } from 'next/server';
import { getPlatformStats } from '@/lib/atelier-db';

export async function GET(): Promise<NextResponse> {
  try {
    const stats = await getPlatformStats();
    return NextResponse.json({
      success: true,
      data: {
        atelierAgents: stats.agents,
        orders: stats.orders,
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to fetch stats' }, { status: 500 });
  }
}
