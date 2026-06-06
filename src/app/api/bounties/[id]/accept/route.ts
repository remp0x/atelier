export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getBountyById, getClaimById, acceptBountyClaim, getClaimsForBounty, isWalletLinkedToUser, isEscrowRefunded } from '@/lib/atelier-db';
import { WalletAuthError } from '@/lib/solana-auth';
import { authenticateUserRequest } from '@/lib/session';
import { tryResolvePrivyUserId } from '@/lib/privy-auth';
import { isPrivyAdmin } from '@/lib/admin-auth';
import { escrowAmountForBudget, refundEscrowOnce, verifyEscrowLanded } from '@/lib/bounty-refund';
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

    if (!claim_id) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: claim_id' },
        { status: 400 },
      );
    }

    const bounty = await getBountyById(params.id);
    if (!bounty) {
      return NextResponse.json({ success: false, error: 'Bounty not found' }, { status: 404 });
    }

    const admin = await isPrivyAdmin(request, body);
    // Admins can fund a bounty straight from the Atelier treasury instead of
    // paying escrow on-chain: the treasury is already the escrow recipient and
    // the source of the agent payout at completion, so an upfront transfer would
    // just move funds from the treasury to itself.
    const fundFromTreasury = body.fund_from_treasury === true && admin;

    // `client_wallet` is the payer that funded escrow on-chain (verified below),
    // independent of how we authenticate the poster's identity.
    const userId = await tryResolvePrivyUserId(request, body);
    let isPoster = false;
    if (userId) {
      isPoster = bounty.user_id === userId || (await isWalletLinkedToUser(userId, bounty.poster_wallet));
    } else if (!fundFromTreasury) {
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

    if (!isPoster && admin) {
      isPoster = true;
    }

    if (!isPoster) {
      return NextResponse.json({ success: false, error: 'Only the poster can accept claims' }, { status: 403 });
    }

    const rawChain = typeof body.payment_chain === 'string' ? body.payment_chain : null;
    const paymentChain: 'solana' | 'base' = fundFromTreasury
      ? bounty.payment_chain === 'base' ? 'base' : 'solana'
      : rawChain === 'base' ? 'base' : 'solana';
    const expectedAmount = escrowAmountForBudget(bounty.budget_usd);
    const hasEscrowPayment =
      !fundFromTreasury &&
      typeof client_wallet === 'string' && client_wallet.length > 0 &&
      typeof escrow_tx_hash === 'string' && escrow_tx_hash.length > 0;

    // The client funds escrow on-chain BEFORE this endpoint runs, so any
    // rejection past this point would strand the poster's USDC in the treasury.
    // When a real escrow payment came in, verify it landed and refund it instead.
    const rejectWithRefund = async (error: string, status: number): Promise<NextResponse> => {
      if (!hasEscrowPayment) {
        return NextResponse.json({ success: false, error }, { status });
      }
      const payment = await verifyEscrowLanded({
        chain: paymentChain,
        txHash: escrow_tx_hash,
        payer: client_wallet,
        amountUsd: expectedAmount,
      });
      if (!payment.verified) {
        return NextResponse.json({ success: false, error }, { status });
      }
      try {
        const refund = await refundEscrowOnce({
          chain: paymentChain,
          escrowTxHash: escrow_tx_hash,
          recipient: client_wallet,
          amountUsd: expectedAmount,
        });
        const note = refund.reason === 'already_refunded'
          ? 'This escrow payment was already refunded.'
          : 'Your escrow payment was refunded.';
        return NextResponse.json(
          { success: false, error: `${error} ${note}`, refunded: true, refund_tx_hash: refund.refundTx },
          { status },
        );
      } catch (refundErr) {
        console.error(`Escrow refund failed for bounty ${params.id} payer ${client_wallet}:`, refundErr);
        return NextResponse.json(
          { success: false, error: `${error} We could not auto-refund your escrow; please contact support.`, refunded: false },
          { status },
        );
      }
    };

    if (bounty.status !== 'open') {
      return rejectWithRefund('Bounty is not open.', 400);
    }

    if (bounty.moderation_status === 'review' || bounty.moderation_status === 'spam') {
      return rejectWithRefund('This bounty is under content review and cannot be accepted yet.', 400);
    }

    const claim = await getClaimById(claim_id);
    if (!claim || claim.bounty_id !== params.id) {
      return rejectWithRefund('Claim not found for this bounty.', 404);
    }

    if (claim.status !== 'pending') {
      return rejectWithRefund('Claim is not in pending status.', 400);
    }

    let escrowHash: string;
    let payerAddress: string;

    if (fundFromTreasury) {
      escrowHash = `treasury_${claim_id}`;
      payerAddress = bounty.poster_wallet;
    } else {
      if (!hasEscrowPayment) {
        return NextResponse.json(
          { success: false, error: 'Missing required fields: client_wallet, escrow_tx_hash' },
          { status: 400 },
        );
      }

      const payment = await verifyEscrowLanded({
        chain: paymentChain,
        txHash: escrow_tx_hash,
        payer: client_wallet,
        amountUsd: expectedAmount,
      });
      if (!payment.verified) {
        return NextResponse.json({ success: false, error: payment.error || 'Payment verification failed' }, { status: 400 });
      }

      if (await isEscrowRefunded(escrow_tx_hash)) {
        return NextResponse.json(
          { success: false, error: 'This escrow payment was already refunded. Please submit a new payment to accept.' },
          { status: 400 },
        );
      }

      escrowHash = escrow_tx_hash;
      payerAddress = client_wallet;
    }

    let result: Awaited<ReturnType<typeof acceptBountyClaim>>;
    try {
      result = await acceptBountyClaim({
        bounty_id: params.id,
        claim_id,
        escrow_tx_hash: escrowHash,
        payment_chain: paymentChain,
        payer_address: payerAddress,
        payment_method: paymentChain === 'base' ? 'usdc-base' : 'usdc',
      });
    } catch (acceptErr) {
      console.error('acceptBountyClaim failed after escrow verified:', acceptErr);
      // Funds are already verified in the treasury; don't strand them on a DB error.
      if (hasEscrowPayment) {
        try {
          const refund = await refundEscrowOnce({
            chain: paymentChain,
            escrowTxHash: escrow_tx_hash,
            recipient: client_wallet,
            amountUsd: expectedAmount,
          });
          return NextResponse.json(
            { success: false, error: 'Could not finalize the order; your escrow was refunded.', refunded: true, refund_tx_hash: refund.refundTx },
            { status: 500 },
          );
        } catch (refundErr) {
          console.error(`Escrow refund failed after acceptBountyClaim error for bounty ${params.id}:`, refundErr);
        }
      }
      return NextResponse.json({ success: false, error: 'Failed to accept claim' }, { status: 500 });
    }

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
