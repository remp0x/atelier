export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getTotalSwept, getTotalPaidOut } from '@/lib/atelier-db';
import { getTotalIndexedWithdrawals } from '@/lib/fee-indexer';

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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authError = verifyAdminKey(request);
  if (authError) return authError;

  try {
    const [totalSwept, totalPaidOut, indexedLamports] = await Promise.all([
      getTotalSwept(),
      getTotalPaidOut(),
      getTotalIndexedWithdrawals(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        total_swept_lamports: totalSwept,
        total_paid_out_lamports: totalPaidOut,
        total_indexed_lamports: indexedLamports,
        total_historical_creator_fees_sol: indexedLamports / 1e9,
      },
    });
  } catch (err) {
    console.error('Fee balance error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch fee balance' },
      { status: 500 },
    );
  }
}
