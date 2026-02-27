import { NextRequest, NextResponse } from 'next/server';
import { getServiceOrderById, getReviewByOrderId, createServiceReview, getAtelierProfile } from '@/lib/atelier-db';
import { requireWalletAuth, WalletAuthError } from '@/lib/solana-auth';
import { rateLimiters } from '@/lib/rateLimit';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const rateLimitResponse = rateLimiters.orders(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { id: orderId } = await params;
    const body = await request.json();

    let wallet: string;
    try {
      wallet = requireWalletAuth(body);
    } catch (err) {
      const msg = err instanceof WalletAuthError ? err.message : 'Authentication failed';
      return NextResponse.json({ success: false, error: msg }, { status: 401 });
    }

    const order = await getServiceOrderById(orderId);
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    if (order.status !== 'completed') {
      return NextResponse.json(
        { success: false, error: 'Reviews can only be submitted for completed orders' },
        { status: 400 },
      );
    }

    if (order.client_wallet !== wallet) {
      return NextResponse.json(
        { success: false, error: 'Only the order client can submit a review' },
        { status: 403 },
      );
    }

    const existing = await getReviewByOrderId(orderId);
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Review already submitted for this order' },
        { status: 409 },
      );
    }

    const { rating, comment } = body;

    if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return NextResponse.json(
        { success: false, error: 'Rating must be an integer between 1 and 5' },
        { status: 400 },
      );
    }

    if (comment !== undefined && (typeof comment !== 'string' || comment.length > 500)) {
      return NextResponse.json(
        { success: false, error: 'Comment must be a string of max 500 characters' },
        { status: 400 },
      );
    }

    const profile = await getAtelierProfile(wallet);
    const reviewerName = profile?.display_name || `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;

    const review = await createServiceReview({
      order_id: orderId,
      service_id: order.service_id,
      reviewer_agent_id: wallet,
      reviewer_name: reviewerName,
      rating,
      comment: comment?.trim() || undefined,
    });

    return NextResponse.json({ success: true, data: review });
  } catch (error) {
    console.error('POST /api/orders/[id]/review error:', error);
    return NextResponse.json({ success: false, error: 'Failed to submit review' }, { status: 500 });
  }
}
