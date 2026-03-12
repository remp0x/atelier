export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getBountyById, getClaimById, acceptBountyClaim, getClaimsForBounty } from '@/lib/atelier-db';
import { requireWalletAuth, WalletAuthError } from '@/lib/solana-auth';
import { verifySolanaUsdcPayment } from '@/lib/solana-verify';
import { notifyAgentWebhook } from '@/lib/webhook';
import { rateLimiters } from '@/lib/rateLimit';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const rateLimitResponse = rateLimiters.orders(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const { claim_id, client_wallet, escrow_tx_hash } = body;

    if (!claim_id || !client_wallet || !escrow_tx_hash) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: claim_id, client_wallet, escrow_tx_hash' },
        { status: 400 },
      );
    }

    let verifiedWallet: string;
    try {
      verifiedWallet = requireWalletAuth({
        wallet: client_wallet,
        wallet_sig: body.wallet_sig,
        wallet_sig_ts: body.wallet_sig_ts,
      });
    } catch (err) {
      const msg = err instanceof WalletAuthError ? err.message : 'Authentication failed';
      return NextResponse.json({ success: false, error: msg }, { status: 401 });
    }

    if (verifiedWallet !== client_wallet) {
      return NextResponse.json({ success: false, error: 'Wallet mismatch' }, { status: 403 });
    }

    const bounty = await getBountyById(params.id);
    if (!bounty) {
      return NextResponse.json({ success: false, error: 'Bounty not found' }, { status: 404 });
    }

    if (bounty.poster_wallet !== verifiedWallet) {
      return NextResponse.json({ success: false, error: 'Only the poster can accept claims' }, { status: 403 });
    }

    if (bounty.status !== 'open') {
      return NextResponse.json({ success: false, error: 'Bounty is not open' }, { status: 400 });
    }

    const claim = await getClaimById(claim_id);
    if (!claim || claim.bounty_id !== params.id) {
      return NextResponse.json({ success: false, error: 'Claim not found for this bounty' }, { status: 404 });
    }

    if (claim.status !== 'pending') {
      return NextResponse.json({ success: false, error: 'Claim is not in pending status' }, { status: 400 });
    }

    const expectedAmount = parseFloat(bounty.budget_usd) * 1.10;
    const paymentResult = await verifySolanaUsdcPayment(escrow_tx_hash, client_wallet, expectedAmount);
    if (!paymentResult.verified) {
      return NextResponse.json({ success: false, error: paymentResult.error || 'Payment verification failed' }, { status: 400 });
    }

    const result = await acceptBountyClaim({
      bounty_id: params.id,
      claim_id,
      escrow_tx_hash,
    });

    notifyAgentWebhook(claim.agent_id, {
      event: 'bounty.accepted',
      order_id: result.order.id,
      data: {
        bounty_id: bounty.id,
        brief: bounty.brief,
        budget_usd: bounty.budget_usd,
        deadline_hours: bounty.deadline_hours,
      },
    });

    const allClaims = await getClaimsForBounty(params.id);
    for (const c of allClaims) {
      if (c.id !== claim_id && c.status === 'rejected') {
        notifyAgentWebhook(c.agent_id, {
          event: 'bounty.claim_rejected',
          order_id: result.order.id,
          data: { bounty_id: bounty.id },
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        bounty_id: result.bounty.id,
        order_id: result.order.id,
        claim_id: result.claim.id,
      },
    });
  } catch (error) {
    console.error('Error accepting bounty claim:', error);
    return NextResponse.json({ success: false, error: 'Failed to accept claim' }, { status: 500 });
  }
}
