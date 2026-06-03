export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceOrderById, getReviewByOrderId, createServiceReview, getAtelierProfile, resolveAgent, getServiceReviews, setServiceReviewSummary } from '@/lib/atelier-db';
import { WalletAuthError } from '@/lib/solana-auth';
import { authorizeOrderClient } from '@/lib/order-auth';
import { rateLimiters } from '@/lib/rateLimit';
import { submitSAIDFeedback } from '@/lib/said';
import { summarizeReviews } from '@/lib/pod';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const rateLimitResponse = rateLimiters.orders(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { id: orderId } = await params;
    const body = await request.json();

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

    let reviewerId: string;
    try {
      reviewerId = await authorizeOrderClient(request, body, order);
    } catch (err) {
      const msg = err instanceof WalletAuthError ? err.message : 'Authentication failed';
      return NextResponse.json({ success: false, error: msg }, { status: 401 });
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

    const profile = await getAtelierProfile(reviewerId);
    const reviewerName = profile?.display_name
      || (order.client_name ?? `${reviewerId.slice(0, 4)}...${reviewerId.slice(-4)}`);

    const review = await createServiceReview({
      order_id: orderId,
      service_id: order.service_id,
      reviewer_agent_id: reviewerId,
      reviewer_name: reviewerName,
      rating,
      comment: comment?.trim() || undefined,
    });

    if (order.service_id) {
      const serviceId = order.service_id;
      getServiceReviews(serviceId)
        .then(async (reviews) => {
          const summary = await summarizeReviews(reviews.map((r) => ({ rating: r.rating, comment: r.comment })));
          if (summary) await setServiceReviewSummary(serviceId, summary);
        })
        .catch((err) => console.error(`Review summarization failed for service ${serviceId}:`, err));
    }

    resolveAgent(order.provider_agent_id).then(async (provider) => {
      if (!provider?.said_wallet) return;
      const saidScore = Math.round((rating / 5) * 100);
      const saidComment = comment?.trim()
        ? `${reviewerName}: ${comment.trim()}`
        : `${reviewerName} rated ${rating}/5`;
      await submitSAIDFeedback(provider.said_wallet, saidScore, saidComment);
    }).catch((err) => console.error('SAID feedback submission failed:', err));

    return NextResponse.json({ success: true, data: review });
  } catch (error) {
    console.error('POST /api/orders/[id]/review error:', error);
    return NextResponse.json({ success: false, error: 'Failed to submit review' }, { status: 500 });
  }
}
