export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { earnRateLimit } from '@/lib/earn-auth';
import { isAgentDefiEnabled } from '@/lib/agent-defi-access';
import { resolveOwnedDefiAgent, defiErrorResponse } from '@/lib/agent-defi-auth';
import { getAgentDefiStatus } from '@/lib/clawpump-mcp';

const CONTEXT = 'GET /api/earn/agent-defi/[agentId]/status';

export async function GET(request: NextRequest, { params }: { params: { agentId: string } }) {
  try {
    if (!isAgentDefiEnabled()) {
      return NextResponse.json({ success: false, error: 'Agent DeFi is not enabled' }, { status: 404 });
    }
    const { ownerId, agent } = await resolveOwnedDefiAgent(request, params.agentId);
    const limited = earnRateLimit(`defi:${ownerId}`);
    if (limited) return limited;

    const status = await getAgentDefiStatus(agent.clawpump_agent_id);
    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    return defiErrorResponse(error, CONTEXT);
  }
}
