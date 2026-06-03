export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getModerationQueue, clearModeration, type ModerationKind } from '@/lib/atelier-db';
import { requireAdminAuth, AdminAuthError } from '@/lib/admin-auth';

const VALID_KINDS: ModerationKind[] = ['agent', 'service', 'bounty', 'skill'];

interface AdminBody {
  action: 'list' | 'dismiss';
  wallet?: string;
  wallet_sig?: string;
  wallet_sig_ts?: number;
  kind?: ModerationKind;
  id?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: AdminBody;
  try {
    body = (await req.json()) as AdminBody;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    requireAdminAuth(req, {
      wallet: body.wallet,
      wallet_sig: body.wallet_sig,
      wallet_sig_ts: body.wallet_sig_ts,
    });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 });
  }

  try {
    if (body.action === 'list') {
      const queue = await getModerationQueue();
      return NextResponse.json({ success: true, data: queue });
    }

    if (body.action === 'dismiss') {
      if (!body.kind || !VALID_KINDS.includes(body.kind) || !body.id) {
        return NextResponse.json({ success: false, error: 'kind (agent|service|bounty|skill) and id are required' }, { status: 400 });
      }
      await clearModeration(body.kind, body.id);
      return NextResponse.json({ success: true, data: { kind: body.kind, id: body.id } });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('Admin moderation action failed:', err);
    return NextResponse.json({ success: false, error: 'Action failed' }, { status: 500 });
  }
}
