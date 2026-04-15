export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, requireAdminAuth } from '@/lib/admin-auth';
import {
  createPartnerChannel,
  listPartnerChannels,
  rotatePartnerApiKey,
  updatePartnerChannel,
  type PartnerChannel,
} from '@/lib/partners-db';

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

function serializePartner(p: PartnerChannel): Omit<PartnerChannel, 'api_key_hash'> {
  const { api_key_hash: _apiKeyHash, ...rest } = p;
  return rest;
}

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

  if (action === 'list') {
    const partners = await listPartnerChannels();
    return NextResponse.json({ success: true, data: partners.map(serializePartner) });
  }

  if (action === 'create') {
    const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const walletAddress = typeof body.wallet_address === 'string' ? body.wallet_address.trim() : '';
    const feeSplitBps = typeof body.fee_split_bps === 'number' ? body.fee_split_bps : 5000;
    if (!SLUG_PATTERN.test(slug)) {
      return NextResponse.json({ success: false, error: 'Invalid slug' }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ success: false, error: 'name is required' }, { status: 400 });
    }
    if (feeSplitBps < 0 || feeSplitBps > 10000) {
      return NextResponse.json({ success: false, error: 'fee_split_bps must be 0-10000' }, { status: 400 });
    }
    try {
      const { partner, api_key } = await createPartnerChannel({
        slug,
        name,
        wallet_address: walletAddress || undefined,
        fee_split_bps: feeSplitBps,
      });
      return NextResponse.json({ success: true, data: { partner: serializePartner(partner), api_key } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create partner';
      const conflict = /UNIQUE|PRIMARY KEY/i.test(message);
      return NextResponse.json(
        { success: false, error: conflict ? 'Partner with this slug already exists' : message },
        { status: conflict ? 409 : 500 },
      );
    }
  }

  if (action === 'update') {
    const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
    if (!SLUG_PATTERN.test(slug)) {
      return NextResponse.json({ success: false, error: 'Invalid slug' }, { status: 400 });
    }
    const updates: {
      name?: string;
      wallet_address?: string | null;
      fee_split_bps?: number;
      active?: boolean;
    } = {};
    if (typeof body.name === 'string') updates.name = body.name.trim();
    if (body.wallet_address !== undefined) {
      if (body.wallet_address === null || body.wallet_address === '') {
        updates.wallet_address = null;
      } else if (typeof body.wallet_address === 'string') {
        updates.wallet_address = body.wallet_address.trim();
      }
    }
    if (typeof body.fee_split_bps === 'number') {
      if (body.fee_split_bps < 0 || body.fee_split_bps > 10000) {
        return NextResponse.json({ success: false, error: 'fee_split_bps must be 0-10000' }, { status: 400 });
      }
      updates.fee_split_bps = body.fee_split_bps;
    }
    if (typeof body.active === 'boolean') updates.active = body.active;
    const partner = await updatePartnerChannel(slug, updates);
    if (!partner) {
      return NextResponse.json({ success: false, error: 'Partner not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: serializePartner(partner) });
  }

  if (action === 'rotate_key') {
    const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
    if (!SLUG_PATTERN.test(slug)) {
      return NextResponse.json({ success: false, error: 'Invalid slug' }, { status: 400 });
    }
    const apiKey = await rotatePartnerApiKey(slug);
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'Partner not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { api_key: apiKey } });
  }

  return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
}
