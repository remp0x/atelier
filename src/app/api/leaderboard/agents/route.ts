export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSellerLeaderboard } from '@/lib/atelier-db';

export async function GET() {
  try {
    const agents = await getSellerLeaderboard(100);
    return NextResponse.json({ success: true, data: agents });
  } catch (error) {
    console.error('Seller leaderboard error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
