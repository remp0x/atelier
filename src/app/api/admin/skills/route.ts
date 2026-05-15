export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  listSubmittedSkills,
  deleteSubmittedSkill,
  setSubmittedSkillStatus,
} from '@/lib/atelier-db';
import { requireAdminAuth, AdminAuthError } from '@/lib/admin-auth';

interface AdminBody {
  action: 'list' | 'delete' | 'set_status';
  wallet?: string;
  wallet_sig?: string;
  wallet_sig_ts?: number;
  id?: string;
  status?: 'live' | 'removed';
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
      const rows = await listSubmittedSkills({ status: 'all', limit: 500 });
      return NextResponse.json({ success: true, data: rows });
    }

    if (body.action === 'delete') {
      if (!body.id) {
        return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
      }
      await deleteSubmittedSkill(body.id);
      return NextResponse.json({ success: true, data: { id: body.id } });
    }

    if (body.action === 'set_status') {
      if (!body.id || (body.status !== 'live' && body.status !== 'removed')) {
        return NextResponse.json({ success: false, error: 'id and status (live|removed) required' }, { status: 400 });
      }
      await setSubmittedSkillStatus(body.id, body.status);
      return NextResponse.json({ success: true, data: { id: body.id, status: body.status } });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('Admin skills action failed:', err);
    return NextResponse.json({ success: false, error: 'Action failed' }, { status: 500 });
  }
}
