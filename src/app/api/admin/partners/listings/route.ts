export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, requireAdminAuth } from '@/lib/admin-auth';
import { getAtelierAgents, resolveAgent } from '@/lib/atelier-db';
import {
  addAgentToPartner,
  getPartnerChannel,
  listPartnerAgentIds,
  removeAgentFromPartner,
} from '@/lib/partners-db';

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    requireAdminAuth(request, body as { wallet?: string; wallet_sig?: string; wallet_sig_ts?: number });
  } catch (err) {
    const e = err as AdminAuthError;
    return NextResponse.json({ success: false, error: e.message }, { status: e.status || 401 });
  }

  const action = typeof body.action === 'string' ? body.action : '';
  const partnerSlug = typeof body.partner_slug === 'string' ? body.partner_slug.trim().toLowerCase() : '';
  if (!SLUG_PATTERN.test(partnerSlug)) {
    return NextResponse.json({ success: false, error: 'Invalid partner_slug' }, { status: 400 });
  }

  const partner = await getPartnerChannel(partnerSlug);
  if (!partner) {
    return NextResponse.json({ success: false, error: 'Partner not found' }, { status: 404 });
  }

  if (action === 'list') {
    const curatedIds = new Set(await listPartnerAgentIds(partnerSlug));
    const search = typeof body.search === 'string' ? body.search.trim() : '';
    const limit = typeof body.limit === 'number' ? Math.min(body.limit, 100) : 50;
    const agents = await getAtelierAgents({ search: search || undefined, limit, source: 'all' });
    return NextResponse.json({
      success: true,
      data: {
        curated_ids: Array.from(curatedIds),
        agents: agents.map(a => ({
          id: a.id,
          slug: a.slug,
          name: a.name,
          description: a.description,
          avatar_url: a.avatar_url,
          verified: a.verified,
          is_atelier_official: a.is_atelier_official,
          services_count: a.services_count,
          avg_rating: a.avg_rating,
          curated: curatedIds.has(a.id),
        })),
      },
    });
  }

  if (action === 'add' || action === 'remove') {
    const agentIdOrSlug = typeof body.agent_id === 'string' ? body.agent_id.trim() : '';
    if (!agentIdOrSlug) {
      return NextResponse.json({ success: false, error: 'agent_id is required' }, { status: 400 });
    }
    const agent = await resolveAgent(agentIdOrSlug);
    if (!agent) {
      return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 });
    }
    if (action === 'add') {
      const added = await addAgentToPartner(agent.id, partnerSlug);
      return NextResponse.json({ success: true, data: { added, agent_id: agent.id } });
    }
    const removed = await removeAgentFromPartner(agent.id, partnerSlug);
    return NextResponse.json({ success: true, data: { removed, agent_id: agent.id } });
  }

  return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
}
