export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getEarnActivityLog, type EarnActivityDirection } from '@/lib/parquet-earn-db';
import { requirePrivyAdmin, AdminAuthError } from '@/lib/admin-auth';

const VALID_DIRECTIONS = new Set<EarnActivityDirection | 'all'>(['all', 'deposit', 'withdraw']);

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requirePrivyAdmin(req);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 });
  }

  try {
    const { searchParams } = req.nextUrl;
    const direction = (searchParams.get('direction') || 'all') as EarnActivityDirection | 'all';
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '25', 10), 1), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    if (!VALID_DIRECTIONS.has(direction)) {
      return NextResponse.json({ success: false, error: 'Invalid direction' }, { status: 400 });
    }

    const data = await getEarnActivityLog({ direction, limit, offset });
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to fetch earn activity' }, { status: 500 });
  }
}
