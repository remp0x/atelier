export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { listBounties, getClaimsForBounty } from '@/lib/atelier-db';
import { requirePrivyAdmin, AdminAuthError } from '@/lib/admin-auth';

const ALL_STATUSES = 'open,claimed,completed,expired,cancelled,disputed';

interface AdminBody {
  action: 'list';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: AdminBody;
  try {
    body = (await req.json()) as AdminBody;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    await requirePrivyAdmin(req);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 });
  }

  try {
    if (body.action !== 'list') {
      return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
    }

    const { data: bounties } = await listBounties({ status: ALL_STATUSES, limit: 50 });
    const withClaims = await Promise.all(
      bounties.map(async (bounty) => ({
        ...bounty,
        claims: await getClaimsForBounty(bounty.id),
      })),
    );

    return NextResponse.json({ success: true, data: withClaims });
  } catch (err) {
    console.error('Admin bounties list failed:', err);
    return NextResponse.json({ success: false, error: 'Failed to load bounties' }, { status: 500 });
  }
}
