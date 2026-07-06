export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { AuthError } from '@/lib/atelier-auth';
import { earnRateLimit } from '@/lib/earn-auth';
import { isAgentDefiEnabled } from '@/lib/agent-defi-access';
import { resolveOwnedDefiAgent, defiErrorResponse } from '@/lib/agent-defi-auth';
import { withdrawFromAgentWallet, type WithdrawInput } from '@/lib/clawpump-mcp';

const CONTEXT = 'POST /api/earn/agent-defi/[agentId]/withdraw';

function parseWithdraw(body: Record<string, unknown>): WithdrawInput {
  const { asset, amount, destination } = body;
  if (asset !== 'SOL' && asset !== 'USDC') throw new AuthError("asset must be 'SOL' or 'USDC'", 400);
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new AuthError('amount must be a positive number', 400);
  }
  if (destination !== undefined && typeof destination !== 'string') {
    throw new AuthError('destination must be a string when provided', 400);
  }
  return { asset, amount, ...(destination ? { destination } : {}) };
}

export async function POST(request: NextRequest, { params }: { params: { agentId: string } }) {
  try {
    if (!isAgentDefiEnabled()) {
      return NextResponse.json({ success: false, error: 'Agent DeFi is not enabled' }, { status: 404 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { ownerId, agent } = await resolveOwnedDefiAgent(request, params.agentId, body);
    const limited = earnRateLimit(`defi:${ownerId}`);
    if (limited) return limited;

    const input = parseWithdraw(body);
    const result = await withdrawFromAgentWallet(agent.clawpump_agent_id, input);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return defiErrorResponse(error, CONTEXT);
  }
}
