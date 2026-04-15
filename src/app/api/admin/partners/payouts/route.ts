export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, requireAdminAuth } from '@/lib/admin-auth';
import { listPartnerPayouts } from '@/lib/partners-db';

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

  const partnerSlug = typeof body.partner_slug === 'string' ? body.partner_slug.trim().toLowerCase() : '';
  if (partnerSlug && !SLUG_PATTERN.test(partnerSlug)) {
    return NextResponse.json({ success: false, error: 'Invalid partner_slug' }, { status: 400 });
  }
  const limit = typeof body.limit === 'number' ? Math.min(body.limit, 500) : 100;

  const payouts = await listPartnerPayouts(partnerSlug || undefined, limit);
  return NextResponse.json({ success: true, data: payouts });
}
