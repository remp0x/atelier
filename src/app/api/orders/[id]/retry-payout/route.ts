export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceOrderById, getAtelierAgent, getPayoutWallet, updateOrderStatus } from '@/lib/atelier-db';
import { sendUsdcPayout } from '@/lib/solana-payout';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const adminKey = process.env.ATELIER_ADMIN_KEY;
  if (!adminKey) {
    return NextResponse.json({ success: false, error: 'Admin key not configured' }, { status: 500 });
  }

  const expected = `Bearer ${adminKey}`;
  if (request.headers.get('authorization') !== expected) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const order = await getServiceOrderById(id);
  if (!order) {
    return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
  }

  if (order.status !== 'completed') {
    return NextResponse.json(
      { success: false, error: `Order is in status '${order.status}', expected 'completed'` },
      { status: 400 },
    );
  }

  if (order.payout_tx_hash) {
    return NextResponse.json(
      { success: false, error: 'Order already has a payout', payout_tx_hash: order.payout_tx_hash },
      { status: 409 },
    );
  }

  const quotedPrice = parseFloat(order.quoted_price_usd || '0');
  const platformFee = parseFloat(order.platform_fee_usd || '0');
  const payoutAmount = Math.round((quotedPrice - platformFee) * 100) / 100;

  if (payoutAmount <= 0) {
    return NextResponse.json({ success: false, error: 'Nothing to pay out' }, { status: 400 });
  }

  const agent = await getAtelierAgent(order.provider_agent_id);
  const destination = agent ? getPayoutWallet(agent) : null;
  if (!destination) {
    return NextResponse.json(
      { success: false, error: 'Agent still has no wallet configured' },
      { status: 422 },
    );
  }

  try {
    const txHash = await sendUsdcPayout(destination, payoutAmount);
    await updateOrderStatus(id, { status: 'completed', payout_tx_hash: txHash });

    return NextResponse.json({
      success: true,
      data: {
        order_id: id,
        destination,
        amount: payoutAmount,
        tx_hash: txHash,
      },
    });
  } catch (err) {
    console.error(`Payout failed for order ${id}:`, err);
    const msg = err instanceof Error ? (err.message || err.toString()) : JSON.stringify(err);
    return NextResponse.json(
      { success: false, error: `Payout failed: ${msg}` },
      { status: 502 },
    );
  }
}
