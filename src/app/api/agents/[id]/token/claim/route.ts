export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAtelierAgent, userOwnsAtelierAgent } from '@/lib/atelier-db';
import { authenticateUserRequest } from '@/lib/session';
import { tryResolvePrivyUserId } from '@/lib/privy-auth';
import { resolveExternalAgentByApiKey, AuthError } from '@/lib/atelier-auth';
import { payoutAgentClawpumpFees, previewAgentClawpumpClaim } from '@/lib/clawpump-payouts';
import { rateLimit } from '@/lib/rateLimit';

export const maxDuration = 120;

const claimRateLimit = rateLimit(20, 60 * 60 * 1000);

// Same identities allowed as a token launch: the agent's API key, a Privy owner, or a wallet
// signature matching owner_wallet. Returns { ok } or a ready-to-send error response.
async function authorizeOwner(
  request: NextRequest,
  agentId: string,
  body: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  const authHeader = request.headers.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (bearer && bearer.startsWith('atelier_')) {
    try {
      const apiAgent = await resolveExternalAgentByApiKey(request);
      if (apiAgent.id !== agentId) {
        return { ok: false, res: NextResponse.json({ success: false, error: 'API key does not belong to this agent' }, { status: 403 }) };
      }
      return { ok: true };
    } catch (err) {
      const msg = err instanceof AuthError ? err.message : 'Authentication failed';
      return { ok: false, res: NextResponse.json({ success: false, error: msg }, { status: 401 }) };
    }
  }

  const privyUserId = await tryResolvePrivyUserId(request, null);
  if (privyUserId) {
    const owns = await userOwnsAtelierAgent(privyUserId, agentId);
    return owns
      ? { ok: true }
      : { ok: false, res: NextResponse.json({ success: false, error: 'Only the agent owner can claim earnings' }, { status: 403 }) };
  }

  try {
    const verifiedWallet = await authenticateUserRequest(request, body);
    const agent = await getAtelierAgent(agentId);
    if (!agent || !agent.owner_wallet || agent.owner_wallet !== verifiedWallet) {
      return { ok: false, res: NextResponse.json({ success: false, error: 'Only the agent owner can claim earnings' }, { status: 403 }) };
    }
    return { ok: true };
  } catch {
    return { ok: false, res: NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 }) };
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const auth = await authorizeOwner(request, id, {});
  if (!auth.ok) return auth.res;

  const agent = await getAtelierAgent(id);
  if (!agent) return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 });

  try {
    const preview = await previewAgentClawpumpClaim(agent);
    return NextResponse.json({ success: true, data: preview });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Failed to read earnings' }, { status: 502 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const rateLimitResponse = claimRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // wallet-sig fields would arrive in the body; an empty body is fine for API-key / Privy auth.
  }

  const auth = await authorizeOwner(request, id, body);
  if (!auth.ok) return auth.res;

  const agent = await getAtelierAgent(id);
  if (!agent) return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 });

  try {
    const result = await payoutAgentClawpumpFees(agent);
    if (result.status === 'failed') {
      return NextResponse.json({ success: false, error: result.reason || 'Claim failed' }, { status: 502 });
    }
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Claim failed' }, { status: 502 });
  }
}
