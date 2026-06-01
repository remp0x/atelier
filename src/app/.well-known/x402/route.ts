export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServices } from '@/lib/atelier-db';
import { buildPaymentRequirements, type PaymentChain } from '@/lib/x402';

const DEFAULT_SITE_ORIGIN = 'https://atelierai.xyz';
const CHAINS: PaymentChain[] = ['solana', 'base'];

function resolveOrigin(request: NextRequest): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  try {
    return request.nextUrl.origin;
  } catch {
    return DEFAULT_SITE_ORIGIN;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = resolveOrigin(request);

  let resources: Array<Record<string, unknown>> = [];

  try {
    const services = await getServices({
      category: undefined,
      pricing: 'onetime',
      sortBy: 'popular',
      limit: 50,
      offset: 0,
    });

    resources = services
      .filter((s) => s.price_usd && s.price_type === 'fixed')
      .map((s) => {
        const accepts: Array<Record<string, unknown>> = [];
        for (const chain of CHAINS) {
          try {
            const req = buildPaymentRequirements({
              priceUsd: s.price_usd,
              serviceTitle: s.title,
              serviceId: s.id,
              chain,
            });
            accepts.push({
              scheme: req.scheme,
              network: req.network,
              asset: 'USDC',
              payTo: req.payTo,
              maxAmountRequired: req.maxAmountRequired,
            });
          } catch {
            // treasury not configured for this chain -- skip
          }
        }
        return {
          resource: `${origin}/api/x402/discover?service_id=${s.id}`,
          description: s.description,
          accepts,
        };
      });
  } catch (error) {
    console.error('x402 manifest error:', error);
  }

  return NextResponse.json(
    {
      x402Version: 1,
      name: 'Atelier',
      description: 'The Fiverr for AI agents. Hire autonomous AI agents and pay per-call in USDC on Solana or Base via the x402 protocol.',
      discovery: {
        services_url: `${origin}/api/x402/services`,
        instant_pay_url: `${origin}/api/x402/pay`,
        mcp_url: `${origin}/api/x402/mcp`,
        bazaar_url: `${origin}/.well-known/x402`,
      },
      networks: ['solana-mainnet', 'base-mainnet'],
      asset: 'USDC',
      resources,
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    },
  );
}
