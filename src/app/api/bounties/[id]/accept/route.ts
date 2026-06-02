export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getBountyById, getClaimById, acceptBountyClaim, getClaimsForBounty, isWalletLinkedToUser } from '@/lib/atelier-db';
import { WalletAuthError } from '@/lib/solana-auth';
import { authenticateUserRequest } from '@/lib/session';
import { tryResolvePrivyUserId } from '@/lib/privy-auth';
import { verifySolanaUsdcPayment } from '@/lib/solana-verify';
import { verifyBaseUsdcPayment } from '@/lib/base-verify';
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

    const bounty = await getBountyById(params.id);
    if (!bounty) {
      return NextResponse.json({ success: false, error: 'Bounty not found' }, { status: 404 });
    }

    // `client_wallet` is the payer that funded escrow on-chain (verified below),
    // independent of how we authenticate the poster's identity.
    const userId = await tryResolvePrivyUserId(request, body);
    let isPoster = false;
    if (userId) {
      isPoster = bounty.user_id === userId || (await isWalletLinkedToUser(userId, bounty.poster_wallet));
    } else {
      try {
        const verifiedWallet = await authenticateUserRequest(
          request,
          { wallet: client_wallet, wallet_sig: body.wallet_sig, wallet_sig_ts: body.wallet_sig_ts },
          client_wallet,
        );
        isPoster = bounty.poster_wallet === verifiedWallet;
      } catch (err) {
        const msg = err instanceof WalletAuthError ? err.message : 'Authentication failed';
        return NextResponse.json({ success: false, error: msg }, { status: 401 });
      }
    }

    if (!isPoster) {
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
    const rawChain = typeof body.payment_chain === 'string' ? body.payment_chain : null;
    const paymentChain: 'solana' | 'base' = rawChain === 'base' ? 'base' : 'solana';

    if (paymentChain === 'base') {
      if (typeof escrow_tx_hash !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(escrow_tx_hash)) {
        return NextResponse.json({ success: false, error: 'Invalid Base transaction hash format' }, { status: 400 });
      }
      const paymentResult = await verifyBaseUsdcPayment(
        escrow_tx_hash as `0x${string}`,
        client_wallet,
        expectedAmount,
      );
      if (!paymentResult.verified) {
        return NextResponse.json({ success: false, error: paymentResult.error || 'Payment verification failed' }, { status: 400 });
      }
    } else {
      const paymentResult = await verifySolanaUsdcPayment(escrow_tx_hash, client_wallet, expectedAmount);
      if (!paymentResult.verified) {
        return NextResponse.json({ success: false, error: paymentResult.error || 'Payment verification failed' }, { status: 400 });
      }
    }

    const result = await acceptBountyClaim({
      bounty_id: params.id,
      claim_id,
      escrow_tx_hash,
      payment_chain: paymentChain,
      payer_address: client_wallet,
      payment_method: paymentChain === 'base' ? 'usdc-base' : 'usdc',
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
