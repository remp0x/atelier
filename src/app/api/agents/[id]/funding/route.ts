export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAtelierAgent, userOwnsAtelierAgent } from '@/lib/atelier-db';
import { authenticateUserRequest } from '@/lib/session';
import { tryResolvePrivyUserId } from '@/lib/privy-auth';
import { resolveExternalAgentByApiKey, AuthError } from '@/lib/atelier-auth';
import { getAgentFundingStatus } from '@/lib/agent-funding';

/**
 * The agent pays its own on-chain costs (token launch, SAID identity) from its
 * server wallet. This endpoint is the "know before you go" surface: live-computed
 * amounts + the deposit address, for both the web form and API agents.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const authHeader = request.headers.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let authorized = false;
  if (bearer && bearer.startsWith('atelier_')) {
    try {
      const apiAgent = await resolveExternalAgentByApiKey(request);
      if (apiAgent.id !== id) {
        return NextResponse.json({ success: false, error: 'API key does not belong to this agent' }, { status: 403 });
      }
      authorized = true;
    } catch (err) {
      const msg = err instanceof AuthError ? err.message : 'Authentication failed';
      return NextResponse.json({ success: false, error: msg }, { status: 401 });
    }
  } else {
    const privyUserId = await tryResolvePrivyUserId(request, null);
    if (privyUserId) {
      authorized = await userOwnsAtelierAgent(privyUserId, id);
    } else {
      try {
        const verifiedWallet = await authenticateUserRequest(request, {});
        const agent = await getAtelierAgent(id);
        authorized = !!agent?.owner_wallet && agent.owner_wallet === verifiedWallet;
      } catch {
        return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
      }
    }
  }
  if (!authorized) {
    return NextResponse.json({ success: false, error: 'Only the agent owner can view funding status' }, { status: 403 });
  }

  const agent = await getAtelierAgent(id);
  if (!agent) {
    return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 });
  }

  try {
    const status = await getAgentFundingStatus(agent);
    return NextResponse.json({
      success: true,
      data: {
        deposit_address: status.wallet?.address ?? null,
        balance_sol: status.balanceSol,
        balance_usdc: status.balanceUsdc,
        requirements: {
          launch: { cost_sol: status.launch.costSol, required_sol: status.launch.requiredSol },
          said: { cost_sol: status.said.costSol, required_sol: status.said.requiredSol },
        },
        note: 'The agent wallet pays its own on-chain fees (token launch, SAID identity) and receives 65% of its token creator fees. Send SOL on Solana mainnet to deposit_address.',
      },
    });
  } catch (err) {
    console.error('[agent-funding] status failed:', err);
    return NextResponse.json({ success: false, error: 'Failed to read funding status' }, { status: 502 });
  }
}
