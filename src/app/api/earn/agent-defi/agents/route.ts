export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { AuthError } from '@/lib/atelier-auth';
import { resolveEarnCaller, earnRateLimit } from '@/lib/earn-auth';
import { getDefiCapableAgentsByUser } from '@/lib/atelier-db';
import { isAgentDefiEnabled } from '@/lib/agent-defi-access';
import { isClawpumpMcpConfigured } from '@/lib/clawpump-mcp';

// List the caller's DeFi-capable agents (those that launched a ClawPump token). The UI
// uses this to decide whether to surface the Autonomous Trading product and which agents
// it can drive.
export async function GET(request: NextRequest) {
  try {
    if (!isAgentDefiEnabled()) {
      return NextResponse.json({ success: true, data: { enabled: false, connected: false, agents: [] } });
    }

    const caller = await resolveEarnCaller(request, null);
    const limited = earnRateLimit(`defi:${caller.ownerId}`);
    if (limited) return limited;

    const connected = isClawpumpMcpConfigured();
    if (caller.ownerKind !== 'user') {
      return NextResponse.json({ success: true, data: { enabled: true, connected, agents: [] } });
    }

    const agents = await getDefiCapableAgentsByUser(caller.ownerId);
    return NextResponse.json({
      success: true,
      data: {
        enabled: true,
        connected,
        agents: agents.map((a) => ({
          agent_id: a.id,
          name: a.name,
          token_symbol: a.token_symbol,
          token_mint: a.token_mint,
          avatar_url: a.avatar_url,
        })),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error('GET /api/earn/agent-defi/agents error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
