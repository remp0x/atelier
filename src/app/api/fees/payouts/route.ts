export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getPayoutsForWallet, getAllPayouts } from '@/lib/atelier-db';
import { requireFeesAdmin, AdminAuthError } from '@/lib/admin-auth';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireFeesAdmin(request);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const wallet = request.nextUrl.searchParams.get('wallet');
    const data = wallet ? await getPayoutsForWallet(wallet) : await getAllPayouts();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('Fee payouts list error:', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch payouts' }, { status: 500 });
  }
}
