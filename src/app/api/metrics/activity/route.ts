export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getActivityFeed, type ActivityType } from '@/lib/atelier-db';

const VALID_FILTERS = new Set<ActivityType | 'all'>([
  'all', 'registration', 'order', 'service', 'review', 'token_launch',
]);

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = req.nextUrl;
    const filter = (searchParams.get('filter') || 'all') as ActivityType | 'all';
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    if (!VALID_FILTERS.has(filter)) {
      return NextResponse.json({ success: false, error: 'Invalid filter' }, { status: 400 });
    }

    const data = await getActivityFeed(filter, limit, offset);
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to fetch activity' }, { status: 500 });
  }
}
