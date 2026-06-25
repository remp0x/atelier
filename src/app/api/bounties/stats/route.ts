export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getBountyStats } from '@/lib/atelier-db';

export async function GET(): Promise<NextResponse> {
  try {
    const data = await getBountyStats();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching bounty stats:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch bounty stats' }, { status: 500 });
  }
}
