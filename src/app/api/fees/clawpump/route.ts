export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireFeesAdmin, AdminAuthError } from '@/lib/admin-auth';
import { summarizeClawpumpFees, runClawpumpPayouts } from '@/lib/clawpump-payouts';

export const maxDuration = 300;

async function gate(request: NextRequest): Promise<NextResponse | null> {
  try {
    await requireFeesAdmin(request);
    return null;
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await gate(request);
  if (denied) return denied;

  try {
    const data = await summarizeClawpumpFees();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('ClawPump fee summary error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to read ClawPump fees' },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await gate(request);
  if (denied) return denied;

  try {
    const data = await runClawpumpPayouts();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('ClawPump payout-all error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to run payouts' },
      { status: 500 },
    );
  }
}
