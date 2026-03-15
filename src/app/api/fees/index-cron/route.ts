export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { runFeeIndex } from '@/lib/fee-indexer';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json({ success: false, error: 'CRON_SECRET not configured' }, { status: 500 });
    }

    const authHeader = request.headers.get('authorization') || '';
    const expected = `Bearer ${cronSecret}`;
    if (authHeader.length !== expected.length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { results, total_indexed_lamports, done } = await runFeeIndex('incremental');

    return NextResponse.json({
      success: true,
      data: { done, results, total_indexed_lamports, total_indexed_sol: total_indexed_lamports / 1e9 },
    });
  } catch (err) {
    console.error('Fee index cron error:', err);
    return NextResponse.json({ success: false, error: 'Fee index cron failed' }, { status: 500 });
  }
}
