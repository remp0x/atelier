export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getBountyById } from '@/lib/atelier-db';
import { requirePrivyAdmin, AdminAuthError } from '@/lib/admin-auth';
import { escrowAmountForBudget, refundEscrowOnce, verifyEscrowLanded, type EscrowChain } from '@/lib/bounty-refund';

interface RefundBody {
  tx_hash?: string;
  payer?: string;
  chain?: EscrowChain;
  amount?: number;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  let body: RefundBody;
  try {
    body = (await req.json()) as RefundBody;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    await requirePrivyAdmin(req);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 });
  }

  const { tx_hash, payer } = body;
  if (!tx_hash || !payer) {
    return NextResponse.json(
      { success: false, error: 'Missing required fields: tx_hash, payer' },
      { status: 400 },
    );
  }

  try {
    const bounty = await getBountyById(params.id);
    if (!bounty) {
      return NextResponse.json({ success: false, error: 'Bounty not found' }, { status: 404 });
    }

    const chain: EscrowChain =
      body.chain ?? (bounty.payment_chain === 'base' ? 'base' : 'solana');
    const amountUsd = typeof body.amount === 'number' && body.amount > 0
      ? body.amount
      : escrowAmountForBudget(bounty.budget_usd);

    const payment = await verifyEscrowLanded({ chain, txHash: tx_hash, payer, amountUsd });
    if (!payment.verified) {
      return NextResponse.json(
        { success: false, error: payment.error || 'Could not verify the escrow payment landed in the treasury' },
        { status: 400 },
      );
    }

    const refund = await refundEscrowOnce({ chain, escrowTxHash: tx_hash, recipient: payer, amountUsd });
    if (refund.reason === 'already_refunded') {
      return NextResponse.json(
        { success: false, error: 'This escrow payment was already refunded.' },
        { status: 409 },
      );
    }
    return NextResponse.json({
      success: true,
      data: { bounty_id: bounty.id, chain, amount_usd: amountUsd, refund_tx_hash: refund.refundTx },
    });
  } catch (err) {
    console.error(`Admin bounty refund failed for ${params.id}:`, err);
    return NextResponse.json({ success: false, error: 'Refund failed' }, { status: 500 });
  }
}
