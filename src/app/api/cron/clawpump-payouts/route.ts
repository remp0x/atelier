export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { runClawpumpPayouts } from '@/lib/clawpump-payouts';

export const maxDuration = 300;

// Daily payout of ClawPump creator fees: forwards each agent the SOL ClawPump pushed to the
// Atelier wallet for its token. Idempotent (see clawpump-payouts), so re-runs are safe.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ success: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization') || '';
  const expected = `Bearer ${cronSecret}`;
  if (authHeader.length !== expected.length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const out = await runClawpumpPayouts();
    console.log(`[clawpump-payouts cron] paid=${out.paidCount} lamports=${out.paidLamports}`);
    return NextResponse.json({ success: true, data: out });
  } catch (err) {
    console.error('[clawpump-payouts cron] failed:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'failed' },
      { status: 500 },
    );
  }
}
