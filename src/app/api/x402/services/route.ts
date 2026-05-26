export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServices, type ServiceCategory } from '@/lib/atelier-db';
import { buildPaymentRequirements, computeTotalWithFee, type PaymentChain } from '@/lib/x402';
import { rateLimiters } from '@/lib/rateLimit';

const VALID_CATEGORIES: ServiceCategory[] = ['image_gen', 'video_gen', 'ugc', 'influencer', 'brand_content', 'coding', 'analytics', 'seo', 'trading', 'automation', 'consulting', 'custom'];
const VALID_CHAINS: PaymentChain[] = ['solana', 'base'];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = rateLimiters.services(request);
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = request.nextUrl;

  const chainParam = searchParams.get('chain');
  if (chainParam && !VALID_CHAINS.includes(chainParam as PaymentChain)) {
    return NextResponse.json({ success: false, error: `Unsupported chain: ${chainParam}` }, { status: 400 });
  }
  const chains: PaymentChain[] = chainParam ? [chainParam as PaymentChain] : ['solana', 'base'];

  const category = searchParams.get('category') as ServiceCategory | null;
  if (category && !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ success: false, error: 'Invalid category' }, { status: 400 });
  }

  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50') || 50, 1), 200);
  const offset = Math.max(parseInt(searchParams.get('offset') || '0') || 0, 0);

  try {
    const services = await getServices({
      category: category || undefined,
      pricing: 'onetime',
      sortBy: 'popular',
      limit,
      offset,
    });

    const feed = services
      .filter((s) => s.price_usd && s.price_type === 'fixed')
      .map((s) => {
        const totals = computeTotalWithFee(s.price_usd);
        const payments: Record<string, unknown> = {};
        for (const chain of chains) {
          try {
            const req = buildPaymentRequirements({
              priceUsd: s.price_usd,
              serviceTitle: s.title,
              serviceId: s.id,
              chain,
            });
            payments[chain] = req;
          } catch {
            // treasury not configured for this chain -- skip
          }
        }
        return {
          service_id: s.id,
          title: s.title,
          category: s.category,
          agent_id: s.agent_id,
          agent_name: s.agent_name,
          agent_slug: s.agent_slug,
          turnaround_hours: s.turnaround_hours,
          deliverables: s.deliverables,
          provider_key: s.provider_key,
          quota_limit: s.quota_limit,
          requirement_fields: s.requirement_fields,
          price_usd: totals.priceUsd,
          platform_fee_usd: totals.feeUsd,
          total_charged_usd: totals.totalUsd,
          discover_url: `/api/x402/discover?service_id=${s.id}`,
          order_url: `/api/orders`,
          payments,
        };
      });

    return NextResponse.json(
      {
        success: true,
        data: {
          count: feed.length,
          limit,
          offset,
          services: feed,
        },
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
          'X-Payment-Scheme': 'exact',
          'X-Payment-Asset': 'USDC',
        },
      },
    );
  } catch (error) {
    console.error('x402 price feed error:', error);
    return NextResponse.json({ success: false, error: 'Failed to build price feed' }, { status: 500 });
  }
}
