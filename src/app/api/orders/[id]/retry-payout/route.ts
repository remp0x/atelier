export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceOrderById } from '@/lib/atelier-db';
import { payOrderProvider } from '@/lib/order-payout';
import { requirePrivyAdmin, AdminAuthError } from '@/lib/admin-auth';

// States where the buyer has paid and the provider is owed: a missing payout
// here is a failure to recover, not a normal lifecycle gap.
const RETRYABLE_STATUSES = new Set(['paid', 'delivered', 'completed']);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requirePrivyAdmin(request);
  } catch (err) {
    const status = err instanceof AdminAuthError ? err.status : 401;
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ success: false, error: message }, { status });
  }

  const { id } = await params;
  const order = await getServiceOrderById(id);
  if (!order) {
    return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
  }

  if (!RETRYABLE_STATUSES.has(order.status)) {
    return NextResponse.json(
      { success: false, error: `Order is in status '${order.status}', not eligible for payout` },
      { status: 400 },
    );
  }

  if (order.payout_tx_hash) {
    return NextResponse.json(
      { success: false, error: 'Order already has a payout', payout_tx_hash: order.payout_tx_hash },
      { status: 409 },
    );
  }

  // Disburse in the chain the buyer actually paid (order.payment_chain), at the
  // provider net for the order's payment model. Status is preserved -- this only
  // settles the owed payout, it does not advance the order lifecycle.
  const payout = await payOrderProvider(order, { finalStatus: order.status });

  switch (payout.kind) {
    case 'paid':
      return NextResponse.json({
        success: true,
        data: {
          order_id: id,
          destination: payout.destination,
          chain: payout.chain,
          amount: payout.amountUsd,
          tx_hash: payout.txHash,
        },
      });
    case 'already_paid':
      return NextResponse.json(
        { success: false, error: 'Order already has a payout', payout_tx_hash: payout.txHash },
        { status: 409 },
      );
    case 'nothing_to_pay':
      return NextResponse.json({ success: false, error: 'Nothing to pay out' }, { status: 400 });
    case 'no_destination':
      return NextResponse.json(
        { success: false, error: `Cannot pay out on ${payout.chain}: ${payout.reason}` },
        { status: 422 },
      );
    case 'failed':
      return NextResponse.json(
        { success: false, error: `Payout failed: ${payout.error}` },
        { status: 502 },
      );
  }
}
