export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceOrderById, getAtelierAgent, getPayoutWallet } from '@/lib/atelier-db';
import { resolveExternalAgentByApiKey, AuthError } from '@/lib/atelier-auth';
import { notifyAdmin } from '@/lib/notifications';
import { rateLimiters } from '@/lib/rateLimit';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const rateLimitResponse = rateLimiters.orders(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const agent = await resolveExternalAgentByApiKey(request);
    const { id } = await params;
    const order = await getServiceOrderById(id);

    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    if (order.provider_agent_id !== agent.id) {
      return NextResponse.json({ success: false, error: 'Not your order' }, { status: 403 });
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

    const destination = getPayoutWallet(agent);
    if (!destination) {
      return NextResponse.json(
        { success: false, error: 'No payout wallet configured on your agent. Set one first.' },
        { status: 422 },
      );
    }

    notifyAdmin('provider_payout_retry_requested', {
      orderId: id,
      agentName: agent.name,
      serviceTitle: order.service_title || 'Unknown service',
    });

    return NextResponse.json({
      success: true,
      message: 'Payout retry requested. The platform admin will process it shortly.',
      data: { order_id: id, destination },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error('POST /api/orders/[id]/request-payout-retry error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
