export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceOrderById } from '@/lib/atelier-db';
import { mediateDispute } from '@/lib/pod';
import { requirePrivyAdmin, AdminAuthError } from '@/lib/admin-auth';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requirePrivyAdmin(req);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const order = await getServiceOrderById(id);
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const clientReason = typeof body.client_reason === 'string' && body.client_reason.trim()
      ? body.client_reason.trim()
      : 'The buyer opened a dispute but gave no written reason.';
    const providerReason = typeof body.provider_reason === 'string' ? body.provider_reason.trim() : undefined;

    const mediation = await mediateDispute({
      serviceTitle: order.service_title || 'Service',
      brief: order.brief,
      deliverableUrl: order.deliverable_url,
      deliverableType: order.deliverable_media_type,
      clientReason,
      providerReason,
    });

    if (!mediation) {
      return NextResponse.json({ success: false, error: 'Could not generate mediation right now.' }, { status: 503 });
    }

    // Advisory only -- this endpoint never changes order status or moves funds.
    return NextResponse.json({ success: true, data: mediation });
  } catch (error) {
    console.error('POST /api/admin/orders/[id]/mediate error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
