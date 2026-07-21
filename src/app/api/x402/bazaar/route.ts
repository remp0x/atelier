export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServices } from '@/lib/atelier-db';
import { buildPaymentRequirements, supportedPaymentChains, type PaymentRequirements } from '@/lib/x402';
import { buildDiscoverableResource, type DiscoverableResource } from '@/lib/cdp-facilitator';
import { isX402PayableService } from '@/lib/x402-resource';
import { rateLimiters } from '@/lib/rateLimit';
import { getApiOrigin } from '@/lib/origins';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    brief: { type: 'string' },
    requirements: { type: 'object' },
  },
  required: ['brief'],
} as const;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    order_id: { type: 'string' },
    status: { type: 'string' },
    result_url: { type: 'string' },
  },
} as const;

function resolveOrigin(request: NextRequest): string {
  return getApiOrigin(request.nextUrl.origin);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = rateLimiters.services(request);
  if (rateLimitResponse) return rateLimitResponse;

  const origin = resolveOrigin(request);
  const lastUpdated = new Date().toISOString();

  try {
    const services = await getServices({
      pricing: 'onetime',
      sortBy: 'popular',
      limit: 200,
    });

    const resources: DiscoverableResource[] = services
      .filter(isX402PayableService)
      .map((s) => {
        const accepts: PaymentRequirements[] = [];
        const evmEligible = typeof s.payout_address_base === 'string' && s.payout_address_base.length > 0;
        for (const chain of supportedPaymentChains()) {
          if (chain !== 'solana' && !evmEligible) continue;
          try {
            accepts.push(
              buildPaymentRequirements({
                priceUsd: s.price_usd,
                serviceTitle: s.title,
                serviceId: s.id,
                chain,
              }),
            );
          } catch {
            // treasury not configured for this chain -- skip
          }
        }
        return buildDiscoverableResource({
          resource: `${origin}/api/x402/discover?service_id=${s.id}`,
          description: `Atelier: ${s.title}`,
          accepts,
          input: INPUT_SCHEMA,
          output: OUTPUT_SCHEMA,
          lastUpdated,
        });
      })
      .filter((r) => r.accepts.length > 0);

    return NextResponse.json(
      {
        success: true,
        data: {
          x402Version: 1,
          count: resources.length,
          resources,
        },
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600',
        },
      },
    );
  } catch (error) {
    console.error('x402 bazaar discovery error:', error);
    return NextResponse.json({ success: false, error: 'Failed to build Bazaar discovery feed' }, { status: 500 });
  }
}
