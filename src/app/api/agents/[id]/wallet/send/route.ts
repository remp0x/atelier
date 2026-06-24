export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { getAtelierAgent, userOwnsAtelierAgent } from '@/lib/atelier-db';
import { WalletAuthError } from '@/lib/solana-auth';
import { authenticateUserRequest } from '@/lib/session';
import { tryResolvePrivyUserId } from '@/lib/privy-auth';
import {
  SERVER_WALLETS_ENABLED,
  getServerWalletAddress,
  withdrawUsdcFromServerWallet,
  type WalletChain,
} from '@/lib/privy-server-wallets';
import { rateLimitByKey } from '@/lib/rateLimit';

const sendLimiter = rateLimitByKey(20, 10 * 60 * 1000);
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const CLIENT_ERROR_PATTERNS = [
  /^Insufficient USDC/,
  /^No USDC available/,
  /^Invalid .* destination/,
  /^Amount must be/,
];

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

    // Owner-only, arbitrary destination. The agent API key is rejected here: a
    // free-destination send with a machine credential is the leaked-key risk we
    // designed out. Agents move funds via the destination-locked /agents/me/withdraw.
    if (request.headers.get('authorization')?.startsWith('Bearer atelier_')) {
      return NextResponse.json(
        { success: false, error: 'Sending to an arbitrary address requires owner authentication. Agents use /api/agents/me/withdraw (locked destination).' },
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

    if (!SERVER_WALLETS_ENABLED) {
      return NextResponse.json({ success: false, error: 'Server wallets are not enabled' }, { status: 503 });
    }

    const chain = body.chain as WalletChain | undefined;
    if (chain !== 'solana' && chain !== 'base') {
      return NextResponse.json({ success: false, error: "chain must be 'solana' or 'base'" }, { status: 400 });
    }

    const to = body.to;
    if (typeof to !== 'string' || !to) {
      return NextResponse.json({ success: false, error: 'to (destination address) is required' }, { status: 400 });
    }
    if (chain === 'solana' && !BASE58_REGEX.test(to)) {
      return NextResponse.json({ success: false, error: 'to must be a valid base58 Solana address' }, { status: 400 });
    }
    if (chain === 'base' && !isAddress(to)) {
      return NextResponse.json({ success: false, error: 'to must be a valid EVM address' }, { status: 400 });
    }

    let amountUsd: number | undefined;
    if (body.amount !== undefined && body.amount !== null) {
      if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0) {
        return NextResponse.json({ success: false, error: 'amount must be a positive number' }, { status: 400 });
      }
      amountUsd = body.amount;
    }

    const limited = sendLimiter(`send:${agent.id}`);
    if (limited) return limited;

    const walletId = chain === 'solana' ? agent.privy_solana_wallet_id : agent.privy_evm_wallet_id;
    if (!walletId) {
      return NextResponse.json({ success: false, error: `No ${chain} server wallet provisioned for this agent` }, { status: 400 });
    }

    const walletAddress = await getServerWalletAddress(walletId);

    const result = await withdrawUsdcFromServerWallet({
      walletId,
      walletAddress,
      chain,
      to,
      amountUsd,
    });

    return NextResponse.json({
      success: true,
      data: { tx_hash: result.txHash, amount_usd: result.amountUsd, chain: result.chain, destination: to },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Send failed';
    if (CLIENT_ERROR_PATTERNS.some((re) => re.test(message))) {
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
    console.error('POST /api/agents/[id]/wallet/send error:', error);
    return NextResponse.json({ success: false, error: 'Send failed. Please try again later.' }, { status: 500 });
  }
}
