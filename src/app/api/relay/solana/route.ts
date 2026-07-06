export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticatePrivyRequest, PrivyAuthError } from '@/lib/privy-auth';
import { isBannedIdentity } from '@/lib/atelier-db';
import { rateLimitByKey } from '@/lib/rateLimit';
import {
  SOLANA_RELAY_ENABLED,
  RelayPolicyError,
  sponsorAndSendSolanaTx,
} from '@/lib/solana-relay';

// A sponsored transfer is a real payment action, not a read; 20 per 10 minutes
// per user is generous for humans and starves any farming loop.
const relayLimiter = rateLimitByKey(20, 10 * 60 * 1000);

export async function POST(request: NextRequest) {
  try {
    if (!SOLANA_RELAY_ENABLED) {
      return NextResponse.json({ success: false, error: 'Solana relay is not enabled' }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const user = await authenticatePrivyRequest(request, body);

    const banned = await isBannedIdentity({
      privyUserId: user.privyUserId,
      email: user.googleEmail,
      twitter: user.twitterUsername,
      wallet: user.allSolanaWallets[0] ?? null,
    });
    if (banned) {
      return NextResponse.json({ success: false, error: 'Account is not permitted to use gas sponsorship' }, { status: 403 });
    }

    const limited = relayLimiter(`relay-solana:${user.privyUserId}`);
    if (limited) return limited;

    const transaction = body?.transaction;
    if (typeof transaction !== 'string' || transaction.length === 0) {
      return NextResponse.json({ success: false, error: 'transaction (base64) is required' }, { status: 400 });
    }

    const { signature } = await sponsorAndSendSolanaTx({
      serializedTxBase64: transaction,
      userWallets: user.allSolanaWallets,
    });

    return NextResponse.json({ success: true, data: { signature } });
  } catch (error) {
    if (error instanceof PrivyAuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    if (error instanceof RelayPolicyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('[relay/solana] sponsorship failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'Failed to sponsor transaction' }, { status: 500 });
  }
}
