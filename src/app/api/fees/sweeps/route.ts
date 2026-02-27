import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getFeeSweeps } from '@/lib/atelier-db';

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
    const sweeps = await getFeeSweeps();
    return NextResponse.json({ success: true, data: sweeps });
  } catch (err) {
    console.error('Fee sweeps list error:', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch sweeps' }, { status: 500 });
  }
}
