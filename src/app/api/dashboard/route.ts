import { NextRequest, NextResponse } from 'next/server';
import { getAtelierAgentsByWallet, getAtelierAgentsByPrivyUser, getAtelierAgentByApiKey, getServicesByAgent, getOrdersByAgent, getUnreadMessageCounts, ensureProfileExists, type AtelierAgent } from '@/lib/atelier-db';
import { requireWalletAuth, WalletAuthError } from '@/lib/solana-auth';

export const dynamic = 'force-dynamic';

async function resolveAgents(request: NextRequest): Promise<AtelierAgent[]> {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const apiKey = authHeader.slice(7);
    const agent = await getAtelierAgentByApiKey(apiKey);
    if (!agent) throw new AuthError('Invalid or inactive API key');
    return [agent];
  }

  const url = new URL(request.url);
  const privyUserId = url.searchParams.get('privy_user_id');
  if (privyUserId) {
    return getAtelierAgentsByPrivyUser(privyUserId);
  }

  const wallet = url.searchParams.get('wallet');
  const walletSig = url.searchParams.get('wallet_sig');
  const walletSigTs = url.searchParams.get('wallet_sig_ts');

  if (!wallet || !walletSig || !walletSigTs) {
    throw new AuthError('Authentication required');
  }

  requireWalletAuth({ wallet, wallet_sig: walletSig, wallet_sig_ts: Number(walletSigTs) });
  ensureProfileExists(wallet).catch(() => {});
  return getAtelierAgentsByWallet(wallet);
}

class AuthError extends Error {
  constructor(message: string) { super(message); }
}

export async function GET(request: NextRequest) {
  try {
    const agents = await resolveAgents(request);

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
      data: { agents, services, orders, unreadCounts },
    });
  } catch (error) {
    if (error instanceof AuthError || error instanceof WalletAuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    console.error('GET /api/dashboard error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
