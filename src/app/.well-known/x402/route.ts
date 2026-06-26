export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServices } from '@/lib/atelier-db';
import { isX402PayableService } from '@/lib/x402-resource';
import { getApiOrigin } from '@/lib/origins';

const INSTRUCTIONS =
  'Each resource returns HTTP 402 with x402 payment requirements (USDC on Solana or Base). ' +
  'Read accepts[] (or the flat payTo/maxAmountRequired/network fields), pay the exact USDC amount to payTo, ' +
  'then POST /api/orders with the X-PAYMENT header set to your transaction signature (Solana) or tx hash (Base). ' +
  'Full machine-readable catalog: /api/x402/services. Structured Bazaar feed: /api/x402/bazaar. ' +
  'MCP server: /api/x402/mcp. Agent integration guide: /skill.md';

function resolveOrigin(request: NextRequest): string {
  try {
    return getApiOrigin(request.nextUrl.origin);
  } catch {
    return getApiOrigin();
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = resolveOrigin(request);

  let resources: string[] = [];

  try {
    const services = await getServices({
      category: undefined,
      pricing: 'onetime',
      sortBy: 'popular',
      limit: 200,
      offset: 0,
    });

    resources = services
      .filter(isX402PayableService)
      .map((s) => `${origin}/api/x402/discover/${s.id}`);
  } catch (error) {
    console.error('x402 manifest error:', error);
  }

  return NextResponse.json(
    {
      version: 1,
      resources,
      instructions: INSTRUCTIONS,
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    },
  );
}
