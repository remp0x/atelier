export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolveExternalAgentByApiKey, AuthError } from '@/lib/atelier-auth';
import {
  SERVER_WALLETS_ENABLED,
  getServerWalletAddress,
  withdrawUsdcFromServerWallet,
  type WalletChain,
} from '@/lib/privy-server-wallets';
import { rateLimitByKey } from '@/lib/rateLimit';

const withdrawLimiter = rateLimitByKey(10, 10 * 60 * 1000);

const CLIENT_ERROR_PATTERNS = [
  /^Insufficient USDC/,
  /^No USDC available/,
  /^Invalid .* destination/,
  /^Amount must be/,
];

export async function POST(request: NextRequest) {
  try {
    const agent = await resolveExternalAgentByApiKey(request);

    if (!SERVER_WALLETS_ENABLED) {
      return NextResponse.json({ success: false, error: 'Server wallets are not enabled' }, { status: 503 });
    }

    const limited = withdrawLimiter(`withdraw:${agent.id}`);
    if (limited) return limited;

    const body = await request.json().catch(() => ({}));

    const chain = body.chain as WalletChain | undefined;
    if (chain !== 'solana' && chain !== 'base') {
      return NextResponse.json({ success: false, error: "chain must be 'solana' or 'base'" }, { status: 400 });
    }

    let amountUsd: number | undefined;
    if (body.amount !== undefined && body.amount !== null) {
      if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0) {
        return NextResponse.json({ success: false, error: 'amount must be a positive number' }, { status: 400 });
      }
      amountUsd = body.amount;
    }

    const walletId = chain === 'solana' ? agent.privy_solana_wallet_id : agent.privy_evm_wallet_id;
    if (!walletId) {
      return NextResponse.json({ success: false, error: `No ${chain} server wallet provisioned for this agent` }, { status: 400 });
    }

    const destination = chain === 'solana' ? agent.withdraw_address_solana : agent.withdraw_address_base;
    if (!destination) {
      return NextResponse.json(
        { success: false, error: `No ${chain} withdraw address set. The agent owner must set one first via PUT /api/agents/${agent.id}/withdraw-address (owner authentication required).` },
        { status: 400 },
      );
    }

    const walletAddress = await getServerWalletAddress(walletId);

    const result = await withdrawUsdcFromServerWallet({
      walletId,
      walletAddress,
      chain,
      to: destination,
      amountUsd,
    });

    return NextResponse.json({
      success: true,
      data: {
        tx_hash: result.txHash,
        amount_usd: result.amountUsd,
        chain: result.chain,
        destination,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (CLIENT_ERROR_PATTERNS.some((re) => re.test(message))) {
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
    console.error('POST /api/agents/me/withdraw error:', error);
    return NextResponse.json({ success: false, error: 'Withdrawal failed. Please try again later.' }, { status: 500 });
  }
}
