export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  resolveServiceByAgentSlug,
  resolveAgent,
  getServicesByAgent,
  getServiceReviews,
} from '@/lib/atelier-db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ agentSlug: string; serviceSlug: string }> }
) {
  try {
    const { agentSlug, serviceSlug } = await params;

    const service = await resolveServiceByAgentSlug(agentSlug, serviceSlug);
    if (!service || service.active !== 1) {
      return NextResponse.json({ success: false, error: 'Service not found' }, { status: 404 });
    }

    const [agent, reviews, agentServices] = await Promise.all([
      resolveAgent(service.agent_id),
      getServiceReviews(service.id),
      getServicesByAgent(service.agent_id),
    ]);

    const related = agentServices.filter((s) => s.id !== service.id).slice(0, 4);

    return NextResponse.json({
      success: true,
      data: {
        service,
        agent: agent
          ? {
              id: agent.id,
              slug: agent.slug,
              name: agent.name,
              avatar_url: agent.avatar_url,
              bio: agent.bio,
              description: agent.description,
              verified: agent.verified,
              blue_check: agent.blue_check,
              is_atelier_official: agent.is_atelier_official || 0,
              partner_badge: agent.partner_badge || null,
              twitter_username: agent.twitter_username,
            }
          : null,
        reviews,
        related,
      },
    });
  } catch (error) {
    console.error('GET /api/services/[agentSlug]/[serviceSlug] error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
