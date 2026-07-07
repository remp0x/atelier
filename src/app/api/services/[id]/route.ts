export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceById, updateService, deactivateService, setServiceModeration, clearModeration, type ServiceCategory, type ServicePriceType } from '@/lib/atelier-db';
import { resolveAgentAuth, AuthError } from '@/lib/atelier-auth';
import { validateServiceTitle, findBannedClaim } from '@/lib/content-guard';
import { moderateListing } from '@/lib/pod';

const VALID_CATEGORIES: ServiceCategory[] = ['image_gen', 'video_gen', 'ugc', 'influencer', 'brand_content', 'coding', 'analytics', 'seo', 'trading', 'automation', 'consulting', 'custom'];
const VALID_PRICE_TYPES: ServicePriceType[] = ['fixed', 'quote', 'weekly', 'monthly'];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: serviceId } = await params;

    const service = await getServiceById(serviceId);
    if (!service) {
      return NextResponse.json({ success: false, error: 'Service not found' }, { status: 404 });
    }

    const agent = await resolveAgentAuth(request, service.agent_id);

    if (service.agent_id !== agent.id) {
      return NextResponse.json({ success: false, error: 'Service does not belong to this agent' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: service });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error('GET /api/services/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: serviceId } = await params;

    const existing = await getServiceById(serviceId);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Service not found' }, { status: 404 });
    }

    const agent = await resolveAgentAuth(request, existing.agent_id);

    if (existing.agent_id !== agent.id) {
      return NextResponse.json({ success: false, error: 'Service does not belong to this agent' }, { status: 403 });
    }

    const body = await request.json();
    const { category, description, price_usd, price_type, turnaround_hours, deliverables, demo_url, quota_limit, max_revisions } = body;
    let title: string | undefined = undefined;

    if (category !== undefined && !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { success: false, error: `Invalid category. Valid: ${VALID_CATEGORIES.join(', ')}` },
        { status: 400 }
      );
    }

    if (body.title !== undefined) {
      const titleCheck = validateServiceTitle(body.title);
      if (!titleCheck.valid) {
        return NextResponse.json({ success: false, error: titleCheck.error }, { status: 400 });
      }
      title = titleCheck.value;
    }

    if (description !== undefined && (typeof description !== 'string' || description.length < 40 || description.length > 1000)) {
      return NextResponse.json({ success: false, error: 'description must be between 40 and 1000 characters -- describe what the service delivers, how, and for whom' }, { status: 400 });
    }

    if (title !== undefined || description !== undefined) {
      const bannedClaim = findBannedClaim(`${title ?? existing.title}\n${description ?? existing.description}`);
      if (bannedClaim) {
        return NextResponse.json({ success: false, error: `Listing contains banned content (${bannedClaim}). Remove it and try again.` }, { status: 400 });
      }
    }

    if (price_usd !== undefined && (isNaN(parseFloat(price_usd)) || parseFloat(price_usd) < 0)) {
      return NextResponse.json({ success: false, error: 'price_usd must be a valid non-negative number' }, { status: 400 });
    }

    if (price_type !== undefined && !VALID_PRICE_TYPES.includes(price_type)) {
      return NextResponse.json({ success: false, error: `price_type must be one of: ${VALID_PRICE_TYPES.join(', ')}` }, { status: 400 });
    }

    if (demo_url !== undefined && demo_url !== null) {
      try { new URL(demo_url); } catch {
        return NextResponse.json({ success: false, error: 'demo_url must be a valid URL' }, { status: 400 });
      }
    }

    if (quota_limit !== undefined && (typeof quota_limit !== 'number' || quota_limit < 0 || !Number.isInteger(quota_limit))) {
      return NextResponse.json({ success: false, error: 'quota_limit must be a non-negative integer (0 = unlimited)' }, { status: 400 });
    }

    if (max_revisions !== undefined && (typeof max_revisions !== 'number' || max_revisions < 0 || max_revisions > 10 || !Number.isInteger(max_revisions))) {
      return NextResponse.json({ success: false, error: 'max_revisions must be an integer between 0 and 10' }, { status: 400 });
    }

    const updates: Record<string, string | number | null | undefined> = {};
    if (category !== undefined) updates.category = category;
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (price_usd !== undefined) updates.price_usd = String(price_usd);
    if (price_type !== undefined) updates.price_type = price_type;
    if (turnaround_hours !== undefined) updates.turnaround_hours = Number(turnaround_hours);
    if (deliverables !== undefined) updates.deliverables = JSON.stringify(deliverables);
    if (demo_url !== undefined) updates.demo_url = demo_url;
    if (quota_limit !== undefined) updates.quota_limit = quota_limit;
    if (max_revisions !== undefined) updates.max_revisions = max_revisions;

    const updated = await updateService(serviceId, agent.id, updates);

    // Content edits go back through moderation, mirroring agent listings: a
    // clean verdict clears a 'review' flag on the spot so owners can fix a
    // flagged service and be relisted without an admin. 'spam' stays sticky.
    let moderation: { status: string; reason: string | null } | undefined;
    if ((title !== undefined || description !== undefined) && updated) {
      if (existing.moderation_status === 'spam') {
        moderation = { status: 'spam', reason: existing.moderation_reason ?? null };
      } else {
        const verdict = await moderateListing('service', `${updated.title}\n${updated.description}`);
        if (verdict.verdict === 'ok') {
          if (existing.moderation_status === 'review') {
            await clearModeration('service', serviceId);
          }
          moderation = { status: 'ok', reason: null };
        } else {
          await setServiceModeration(serviceId, verdict.verdict, verdict.reason);
          moderation = { status: verdict.verdict, reason: verdict.reason };
        }
      }
    }

    return NextResponse.json({ success: true, data: moderation && updated ? { ...updated, moderation } : updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error('PATCH /api/services/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: serviceId } = await params;

    const existing = await getServiceById(serviceId);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Service not found' }, { status: 404 });
    }

    const agent = await resolveAgentAuth(request, existing.agent_id);

    if (existing.agent_id !== agent.id) {
      return NextResponse.json({ success: false, error: 'Service does not belong to this agent' }, { status: 403 });
    }

    const deactivated = await deactivateService(serviceId, agent.id);
    if (!deactivated) {
      return NextResponse.json({ success: false, error: 'Failed to deactivate service' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { id: serviceId, active: 0 } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error('DELETE /api/services/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
