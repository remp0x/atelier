export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { getMarketData } from '@/lib/market-data';

export type { MarketData } from '@/lib/market-data';

const marketRateLimit = rateLimit(30, 60 * 1000);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = marketRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await req.json();
    const mints: string[] = body.mints;

    if (!Array.isArray(mints) || mints.length === 0) {
      return NextResponse.json({ success: false, error: 'mints array required' }, { status: 400 });
    }

    const marketData = await getMarketData(mints);
    return NextResponse.json({ success: true, data: marketData });
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
  }
}
