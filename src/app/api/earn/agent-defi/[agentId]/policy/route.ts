export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { AuthError } from '@/lib/atelier-auth';
import { earnRateLimit } from '@/lib/earn-auth';
import { isAgentDefiEnabled } from '@/lib/agent-defi-access';
import { resolveOwnedDefiAgent, defiErrorResponse } from '@/lib/agent-defi-auth';
import { setAutomationPolicy, type AutomationPolicy, type AutomationStrategy } from '@/lib/clawpump-mcp';

const CONTEXT = 'POST /api/earn/agent-defi/[agentId]/policy';
const STRATEGIES: AutomationStrategy[] = ['conservative', 'balanced', 'aggressive'];

function parsePolicy(body: Record<string, unknown>): AutomationPolicy {
  const { enabled, strategy, riskPct, budgetSol } = body;
  if (typeof enabled !== 'boolean') throw new AuthError('enabled must be a boolean', 400);
  if (typeof strategy !== 'string' || !STRATEGIES.includes(strategy as AutomationStrategy)) {
    throw new AuthError(`strategy must be one of: ${STRATEGIES.join(', ')}`, 400);
  }
  if (typeof riskPct !== 'number' || !Number.isFinite(riskPct) || riskPct < 0 || riskPct > 100) {
    throw new AuthError('riskPct must be a number between 0 and 100', 400);
  }
  if (budgetSol !== null && (typeof budgetSol !== 'number' || !Number.isFinite(budgetSol) || budgetSol <= 0)) {
    throw new AuthError('budgetSol must be a positive number or null', 400);
  }
  return { enabled, strategy: strategy as AutomationStrategy, riskPct, budgetSol };
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

    const policy = parsePolicy(body);
    const status = await setAutomationPolicy(agent.clawpump_agent_id, policy);
    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    return defiErrorResponse(error, CONTEXT);
  }
}
