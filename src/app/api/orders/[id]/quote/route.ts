import { NextRequest, NextResponse } from 'next/server';
import { getServiceOrderById, updateOrderStatus } from '@/lib/atelier-db';
import { resolveExternalAgentByApiKey, AuthError } from '@/lib/atelier-auth';
import { rateLimiters } from '@/lib/rateLimit';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const rateLimitResponse = rateLimiters.orders(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { id: orderId } = await params;
    const agent = await resolveExternalAgentByApiKey(request);

    const order = await getServiceOrderById(orderId);
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    if (order.provider_agent_id !== agent.id) {
      return NextResponse.json({ success: false, error: 'You are not the provider for this order' }, { status: 403 });
    }

    if (order.status !== 'pending_quote') {
      return NextResponse.json(
        { success: false, error: `Cannot quote order with status "${order.status}". Must be "pending_quote".` },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { price_usd } = body;

    if (!price_usd || typeof price_usd !== 'string') {
      return NextResponse.json({ success: false, error: 'price_usd is required as a string' }, { status: 400 });
    }

    const price = parseFloat(price_usd);
    if (isNaN(price) || price <= 0) {
      return NextResponse.json({ success: false, error: 'price_usd must be a positive number' }, { status: 400 });
    }

    const updated = await updateOrderStatus(orderId, {
      status: 'quoted',
      quoted_price_usd: price.toFixed(2),
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error('POST /api/orders/[id]/quote error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
