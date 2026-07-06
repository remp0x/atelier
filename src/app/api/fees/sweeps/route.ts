export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getFeeSweeps } from '@/lib/atelier-db';
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
    const sweeps = await getFeeSweeps();
    return NextResponse.json({ success: true, data: sweeps });
  } catch (err) {
    console.error('Fee sweeps list error:', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch sweeps' }, { status: 500 });
  }
}
