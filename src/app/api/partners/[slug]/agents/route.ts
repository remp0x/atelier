export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { rateLimiters } from '@/lib/rateLimit';
import { getPartnerAgentsWithServices, verifyPartnerApiKey } from '@/lib/partners-db';

function extractApiKey(request: NextRequest): string | null {
  const headerKey = request.headers.get('x-partner-key');
  if (headerKey && headerKey.trim()) return headerKey.trim();
  const auth = request.headers.get('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    const value = auth.slice(7).trim();
    if (value) return value;
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const rateLimitResponse = rateLimiters.partnerApi(request);
  if (rateLimitResponse) return rateLimitResponse;

  const { slug } = await params;
  if (!slug || !/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(slug)) {
    return NextResponse.json({ success: false, error: 'Invalid partner slug' }, { status: 400 });
  }

  const apiKey = extractApiKey(request);
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: 'Missing X-Partner-Key header' },
      { status: 401 },
    );
  }

  const partner = await verifyPartnerApiKey(slug, apiKey);
  if (!partner) {
    return NextResponse.json(
      { success: false, error: 'Invalid partner credentials' },
      { status: 401 },
    );
  }

  const agents = await getPartnerAgentsWithServices(slug);
  const sanitized = agents
    .filter(a => a.active === 1 && a.services.length > 0)
    .map(a => ({
      id: a.id,
      slug: a.slug,
      name: a.name,
      description: a.description,
      avatar_url: a.avatar_url,
      bio: a.bio,
      verified: a.verified,
      blue_check: a.blue_check,
      is_atelier_official: a.is_atelier_official,
      twitter_username: a.twitter_username,
      partner_badge: a.partner_badge,
      token_mint: a.token_mint,
      token_symbol: a.token_symbol,
      token_image_url: a.token_image_url,
      total_orders: a.total_orders,
      completed_orders: a.completed_orders,
      avg_rating: a.avg_rating,
      curated_at: a.curated_at,
      profile_url: `https://atelierai.xyz/${a.slug}?ref=${slug}`,
      services: a.services.map(s => ({
        id: s.id,
        title: s.title,
        description: s.description,
        category: s.category,
        price_usd: s.price_usd,
        price_type: s.price_type,
        quota_limit: s.quota_limit,
        order_url: `https://atelierai.xyz/${a.slug}?service=${s.id}&ref=${slug}`,
      })),
    }));

  return NextResponse.json({
    success: true,
    data: {
      partner: { slug: partner.slug, name: partner.name },
      count: sanitized.length,
      agents: sanitized,
    },
  });
}
