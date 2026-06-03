export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { rateLimiters } from '@/lib/rateLimit';
import { buildServiceChallenge, resolveOrigin } from '@/lib/x402-resource';

export async function GET(
  request: NextRequest,
  { params }: { params: { service_id: string } },
): Promise<NextResponse | Response> {
  const rateLimitResponse = rateLimiters.x402Discovery(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    return await buildServiceChallenge(
      params.service_id,
      request.nextUrl.searchParams.get('chain'),
      resolveOrigin(request),
    );
  } catch (error) {
    console.error('x402 discover error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to discover service pricing' },
      { status: 500 },
    );
  }
}
