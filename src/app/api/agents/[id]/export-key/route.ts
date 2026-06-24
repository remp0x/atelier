export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAtelierAgent, userOwnsAtelierAgent } from '@/lib/atelier-db';
import { WalletAuthError } from '@/lib/solana-auth';
import { authenticateUserRequest } from '@/lib/session';
import { tryResolvePrivyUserId } from '@/lib/privy-auth';
import { SERVER_WALLETS_ENABLED, exportServerWalletPrivateKey, WalletExportUnavailableError, type WalletChain } from '@/lib/privy-server-wallets';
import { rateLimitByKey } from '@/lib/rateLimit';

const exportLimiter = rateLimitByKey(3, 60 * 60 * 1000);

export async function POST(
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

    // Owner-only. The agent API key is intentionally rejected: exporting a raw key
    // is a full, irreversible custody handoff, so it requires human authentication.
    if (request.headers.get('authorization')?.startsWith('Bearer atelier_')) {
      return NextResponse.json(
        { success: false, error: 'Private key export requires owner authentication, not an agent API key.' },
        { status: 403 },
      );
    }

    let isOwner = false;
    let actor = 'wallet-sig';
    const viewerUserId = await tryResolvePrivyUserId(request, body);
    if (viewerUserId) {
      isOwner = await userOwnsAtelierAgent(viewerUserId, agent.id);
      actor = viewerUserId;
    } else {
      try {
        const wallet = await authenticateUserRequest(request, body);
        isOwner = !!agent.owner_wallet && agent.owner_wallet === wallet;
        actor = wallet;
      } catch (e) {
        if (e instanceof WalletAuthError) {
          return NextResponse.json({ success: false, error: e.message }, { status: 401 });
        }
        throw e;
      }
    }
    if (!isOwner) {
      return NextResponse.json({ success: false, error: 'Not authorized to export this wallet' }, { status: 403 });
    }

    if (!SERVER_WALLETS_ENABLED) {
      return NextResponse.json({ success: false, error: 'Server wallets are not enabled' }, { status: 503 });
    }

    const chain = body.chain as WalletChain | undefined;
    if (chain !== 'solana' && chain !== 'base') {
      return NextResponse.json({ success: false, error: "chain must be 'solana' or 'base'" }, { status: 400 });
    }

    const limited = exportLimiter(`export:${agent.id}:${chain}`);
    if (limited) return limited;

    const walletId = chain === 'solana' ? agent.privy_solana_wallet_id : agent.privy_evm_wallet_id;
    if (!walletId) {
      return NextResponse.json({ success: false, error: `No ${chain} server wallet provisioned for this agent` }, { status: 400 });
    }

    const privateKey = await exportServerWalletPrivateKey(walletId);

    console.warn(`[agents/export-key] private key exported agent=${agent.id} chain=${chain} actor=${actor}`);

    return NextResponse.json({ success: true, data: { chain, private_key: privateKey } });
  } catch (error) {
    if (error instanceof WalletExportUnavailableError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 501 });
    }
    console.error('POST /api/agents/[id]/export-key error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
