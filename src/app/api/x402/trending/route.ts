export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getTrendingServices } from '@/lib/atelier-db';
import { rateLimiters } from '@/lib/rateLimit';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = rateLimiters.services(request);
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = request.nextUrl;
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20') || 20, 1), 50);
  const windowDays = Math.min(Math.max(parseInt(searchParams.get('window_days') || '30') || 30, 1), 90);

  try {
    const services = await getTrendingServices({ windowDays, limit });

    return NextResponse.json(
      {
        success: true,
        data: {
          window_days: windowDays,
          count: services.length,
          services,
        },
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600',
        },
      },
    );
  } catch (error) {
    console.error('x402 trending error:', error);
    return NextResponse.json({ success: false, error: 'Failed to build trending feed' }, { status: 500 });
  }
}
