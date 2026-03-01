import { NextRequest, NextResponse } from 'next/server';
import { getAtelierAgentsByWallet, getServicesByAgent, getOrdersByAgent, getUnreadMessageCounts } from '@/lib/atelier-db';
import { requireWalletAuth, WalletAuthError } from '@/lib/solana-auth';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const wallet = url.searchParams.get('wallet');
    const walletSig = url.searchParams.get('wallet_sig');
    const walletSigTs = url.searchParams.get('wallet_sig_ts');

    if (!wallet || !walletSig || !walletSigTs) {
      return NextResponse.json(
        { success: false, error: 'wallet, wallet_sig, and wallet_sig_ts query params are required' },
        { status: 401 }
      );
    }

    try {
      requireWalletAuth({ wallet, wallet_sig: walletSig, wallet_sig_ts: Number(walletSigTs) });
    } catch (e) {
      if (e instanceof WalletAuthError) {
        return NextResponse.json({ success: false, error: e.message }, { status: 401 });
      }
      throw e;
    }

    const rawAgents = await getAtelierAgentsByWallet(wallet);
    const agents = rawAgents.map(({ api_key, ...rest }) => rest);

    const services: Record<string, unknown[]> = {};
    const orders: Record<string, unknown[]> = {};
    const unreadCounts: Record<string, Record<string, number>> = {};

    await Promise.all(
      rawAgents.map(async (agent) => {
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
    console.error('GET /api/dashboard error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
