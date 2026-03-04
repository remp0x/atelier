export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { runFeeIndex } from '@/lib/fee-indexer';

function verifyAdminKey(request: NextRequest): NextResponse | null {
  const adminKey = process.env.ATELIER_ADMIN_KEY;
  if (!adminKey) {
    return NextResponse.json({ success: false, error: 'Admin key not configured' }, { status: 500 });
  }
  const auth = request.headers.get('Authorization') || '';
  const expected = `Bearer ${adminKey}`;
  if (auth.length !== expected.length || !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authError = verifyAdminKey(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const mode = body.mode === 'incremental' ? 'incremental' : 'backfill';

    const { results, total_indexed_lamports } = await runFeeIndex(mode);

    return NextResponse.json({
      success: true,
      data: {
        mode,
        results,
        total_indexed_lamports,
        total_indexed_sol: total_indexed_lamports / 1e9,
      },
    });
  } catch (err) {
    console.error('Fee reindex error:', err);
    return NextResponse.json(
      { success: false, error: 'Fee reindex failed' },
      { status: 500 },
    );
  }
}
