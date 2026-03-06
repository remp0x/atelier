export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { processWebhookRetries } from '@/lib/webhook';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const adminKey = process.env.ATELIER_ADMIN_KEY;
    if (!adminKey) {
      return NextResponse.json({ success: false, error: 'Admin key not configured' }, { status: 500 });
    }

    const auth = request.headers.get('Authorization') || '';
    const expected = `Bearer ${adminKey}`;
    if (auth.length !== expected.length || !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await processWebhookRetries();

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error('Webhook retry processing failed:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
