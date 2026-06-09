import { NextRequest, NextResponse } from 'next/server';
import { getAtelierAgentsByWallet, getAtelierAgentsByUser, getAtelierAgentByApiKey, getServicesByAgent, getOrdersByAgent, getUnreadMessageCounts, ensureProfileExists, type AtelierAgent } from '@/lib/atelier-db';
import { WalletAuthError } from '@/lib/solana-auth';
import { authenticateUserRequest, readSigFieldsFromQuery } from '@/lib/session';
import { tryResolvePrivyUserId } from '@/lib/privy-auth';

export const dynamic = 'force-dynamic';

// Fields that must never reach the client. api_key is intentionally retained:
// the dashboard is the owner's surface for managing their agents' keys.
function sanitizeAgent(agent: AtelierAgent): AtelierAgent {
  return {
    ...agent,
    said_secret_key: null,
    webhook_secret: null,
    registration_ip: null,
    twitter_verification_code: null,
  };
}

async function resolveAgents(request: NextRequest): Promise<AtelierAgent[]> {
  const authHeader = request.headers.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  // Machine agent: its own API key (atelier_...) returns only that agent.
  if (bearer && bearer.startsWith('atelier_')) {
    const agent = await getAtelierAgentByApiKey(bearer);
    if (!agent) throw new AuthError('Invalid or inactive API key');
    return [agent];
  }

  // Social login: identity comes from a verified Privy token, never a
  // client-asserted privy_user_id.
  const userId = await tryResolvePrivyUserId(request, null);
  if (userId) {
    return getAtelierAgentsByUser(userId);
  }

  // Legacy wallet-signature path.
  const wallet = await authenticateUserRequest(request, readSigFieldsFromQuery(request));
  ensureProfileExists(wallet).catch(() => {});
  return getAtelierAgentsByWallet(wallet);
}

class AuthError extends Error {
  constructor(message: string) { super(message); }
}

export async function GET(request: NextRequest) {
  try {
    const agents = await resolveAgents(request);
    const safeAgents = agents.map(sanitizeAgent);

    const services: Record<string, unknown[]> = {};
    const orders: Record<string, unknown[]> = {};
    const unreadCounts: Record<string, Record<string, number>> = {};

    await Promise.all(
      agents.map(async (agent) => {
        const [agentServices, agentOrders] = await Promise.all([
          getServicesByAgent(agent.id),
          getOrdersByAgent(agent.id, 'provider'),
        ]);
        services[agent.id] = agentServices;
        orders[agent.id] = agentOrders;

        const orderIds = agentOrders.map((o) => o.id);
        if (orderIds.length > 0) {
          unreadCounts[agent.id] = await getUnreadMessageCounts(agent.id, orderIds);
        }
      })
    );

    return NextResponse.json({
      success: true,
      data: { agents: safeAgents, services, orders, unreadCounts },
    });
  } catch (error) {
    if (error instanceof AuthError || error instanceof WalletAuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    console.error('GET /api/dashboard error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
