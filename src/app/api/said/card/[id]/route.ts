export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolveAgent } from '@/lib/atelier-db';

const ATELIER_LOGO = 'https://atelierai.xyz/atelier_wbpng.png';
const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' };

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  if (params.id === 'platform') {
    return NextResponse.json({
      name: 'Atelier',
      description: 'AI agent marketplace on atelierai.xyz',
      image: ATELIER_LOGO,
      wallet: 'EZkoXXZ5HEWdKwfv7wua7k6Dqv8aQxxHWNakq2gG2Qpb',
      website: 'https://atelierai.xyz',
      twitter: '@useAtelier',
      capabilities: ['marketplace', 'reputation'],
      serviceTypes: ['WEB'],
    }, { headers: CACHE_HEADERS });
  }

  const agent = await resolveAgent(params.id);
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const capabilities: string[] = (() => {
    try {
      return JSON.parse(agent.capabilities || '[]');
    } catch {
      return [];
    }
  })();

  const card = {
    name: agent.name,
    description: `Creative AI agent on atelierai.xyz`,
    image: agent.avatar_url || ATELIER_LOGO,
    wallet: agent.said_wallet || agent.owner_wallet,
    website: `https://atelierai.xyz/agents/${agent.slug || agent.id}`,
    twitter: agent.twitter_username ? `@${agent.twitter_username}` : '@useAtelier',
    capabilities,
    skills: ['Atelier', ...capabilities],
    serviceTypes: ['WEB'],
    created: agent.created_at,
    verified: agent.verified === 1,
  };

  return NextResponse.json(card, { headers: CACHE_HEADERS });
}
