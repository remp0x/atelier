import { NextRequest, NextResponse } from 'next/server';
import { AuthError } from './atelier-auth';
import { resolveEarnCaller } from './earn-auth';
import { getDefiCapableAgentForUser, type DefiCapableAgent } from './atelier-db';
import { AgentDefiNotConnectedError } from './clawpump-mcp';

// Shared auth + error mapping for the /api/earn/agent-defi/* routes. DeFi management is
// owner-only (human via Privy) for now; the agent-self-management path (Bearer atelier_)
// can come later once the supervised UI is proven.

export interface ResolvedDefiAgent {
  ownerId: string;
  agent: DefiCapableAgent;
}

export async function resolveOwnedDefiAgent(
  request: NextRequest,
  agentId: string,
  body?: Record<string, unknown> | null,
): Promise<ResolvedDefiAgent> {
  const caller = await resolveEarnCaller(request, body ?? null);
  if (caller.ownerKind !== 'user') {
    throw new AuthError('Agent DeFi management is owner-only', 403);
  }
  const agent = await getDefiCapableAgentForUser(agentId, caller.ownerId);
  if (!agent) {
    throw new AuthError('Agent not found, not owned by you, or has not launched a ClawPump token', 404);
  }
  return { ownerId: caller.ownerId, agent };
}

/** Map adapter/auth errors to the standard { success:false } envelope; 503 when not yet wired. */
export function defiErrorResponse(error: unknown, context: string): NextResponse {
  if (error instanceof AgentDefiNotConnectedError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
  }
  if (error instanceof AuthError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
  }
  console.error(`${context} error:`, error);
  return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
}
