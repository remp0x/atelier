export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { isAddress, getAddress } from 'viem';
import { getAtelierAgent, setAgentWithdrawAddress, userOwnsAtelierAgent } from '@/lib/atelier-db';
import { WalletAuthError } from '@/lib/solana-auth';
import { authenticateUserRequest } from '@/lib/session';
import { tryResolvePrivyUserId } from '@/lib/privy-auth';

const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params;
    const body = await request.json().catch(() => ({}));

    const agent = await getAtelierAgent(id);
    if (!agent) {
      return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 });
    }

    // Owner-only: the withdraw destination is the security anchor for the agent's
    // API-key sweeps, so it must NOT be mutable with the agent API key.
    if (request.headers.get('authorization')?.startsWith('Bearer atelier_')) {
      return NextResponse.json(
        { success: false, error: 'Setting the withdraw address requires owner authentication, not an agent API key.' },
        { status: 403 },
      );
    }

    let isOwner = false;
    const viewerUserId = await tryResolvePrivyUserId(request, body);
    if (viewerUserId) {
      isOwner = await userOwnsAtelierAgent(viewerUserId, agent.id);
    } else {
      try {
        const wallet = await authenticateUserRequest(request, body);
        isOwner = !!agent.owner_wallet && agent.owner_wallet === wallet;
      } catch (e) {
        if (e instanceof WalletAuthError) {
          return NextResponse.json({ success: false, error: e.message }, { status: 401 });
        }
        throw e;
      }
    }
    if (!isOwner) {
      return NextResponse.json({ success: false, error: 'Not authorized to manage this agent' }, { status: 403 });
    }

    const { withdraw_address_solana, withdraw_address_base } = body;
    const updates: { solana?: string | null; base?: string | null } = {};

    if (withdraw_address_solana !== undefined) {
      if (
        withdraw_address_solana !== null &&
        (typeof withdraw_address_solana !== 'string' || !BASE58_REGEX.test(withdraw_address_solana))
      ) {
        return NextResponse.json({ success: false, error: 'withdraw_address_solana must be a valid base58 Solana address' }, { status: 400 });
      }
      updates.solana = withdraw_address_solana;
    }

    if (withdraw_address_base !== undefined) {
      if (
        withdraw_address_base !== null &&
        (typeof withdraw_address_base !== 'string' || !isAddress(withdraw_address_base))
      ) {
        return NextResponse.json({ success: false, error: 'withdraw_address_base must be a valid EVM address' }, { status: 400 });
      }
      updates.base = withdraw_address_base ? getAddress(withdraw_address_base) : withdraw_address_base;
    }

    if (updates.solana === undefined && updates.base === undefined) {
      return NextResponse.json({ success: false, error: 'Provide withdraw_address_solana and/or withdraw_address_base' }, { status: 400 });
    }

    await setAgentWithdrawAddress(agent.id, updates);
    const updated = await getAtelierAgent(agent.id);

    return NextResponse.json({
      success: true,
      data: {
        withdraw_address_solana: updated?.withdraw_address_solana ?? null,
        withdraw_address_base: updated?.withdraw_address_base ?? null,
      },
    });
  } catch (error) {
    console.error('PUT /api/agents/[id]/withdraw-address error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
