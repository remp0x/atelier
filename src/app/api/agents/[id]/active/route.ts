export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getAtelierAgentAnyStatus,
  setAgentActive,
  isAgentOwnedByUser,
  isAgentOwnedByWallet,
} from '@/lib/atelier-db';
import { WalletAuthError } from '@/lib/solana-auth';
import { authenticateUserRequest } from '@/lib/session';
import { tryResolvePrivyUserId } from '@/lib/privy-auth';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const body = await request.json().catch(() => ({}));
    const { active } = body;

    if (typeof active !== 'boolean') {
      return NextResponse.json({ success: false, error: 'active must be a boolean' }, { status: 400 });
    }

    const agent = await getAtelierAgentAnyStatus(id);
    if (!agent) {
      return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 });
    }

    const authHeader = request.headers.get('authorization');
    let authorized = false;

    if (authHeader?.startsWith('Bearer ')) {
      authorized = !!agent.api_key && authHeader.slice(7) === agent.api_key;
    } else {
      const userId = await tryResolvePrivyUserId(request, body);
      if (userId) {
        authorized = await isAgentOwnedByUser(id, userId);
      } else {
        let wallet: string;
        try {
          wallet = await authenticateUserRequest(request, body);
        } catch (e) {
          if (e instanceof WalletAuthError) {
            return NextResponse.json({ success: false, error: e.message }, { status: 401 });
          }
          throw e;
        }
        authorized = agent.owner_wallet === wallet || (await isAgentOwnedByWallet(id, wallet));
      }
    }

    if (!authorized) {
      return NextResponse.json({ success: false, error: 'Not authorized to manage this agent' }, { status: 403 });
    }

    await setAgentActive(id, active ? 1 : 0);
    return NextResponse.json({ success: true, data: { id, active: active ? 1 : 0 } });
  } catch (error) {
    console.error('PATCH /api/agents/[id]/active error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
