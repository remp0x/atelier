export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePrivyAdmin, AdminAuthError } from '@/lib/admin-auth';
import { getAtelierAgent, clearTokenLaunchAttempted } from '@/lib/atelier-db';

// Clears a stuck token_launch_attempted lock so the owner can retry. Admin-only:
// the lock now only persists for the ambiguous "maybe minted" case, so clearing
// it requires a human confirming no token exists. Refuses if a token is already set.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requirePrivyAdmin(request);
  } catch (err) {
    const status = err instanceof AdminAuthError ? err.status : 401;
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unauthorized' },
      { status },
    );
  }

  const { id } = await params;
  const agent = await getAtelierAgent(id);
  if (!agent) {
    return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 });
  }
  if (agent.token_mint) {
    return NextResponse.json(
      { success: false, error: 'Agent already has a token; nothing to clear.' },
      { status: 409 },
    );
  }

  const cleared = await clearTokenLaunchAttempted(id);
  return NextResponse.json({ success: true, data: { agent_id: id, cleared } });
}
