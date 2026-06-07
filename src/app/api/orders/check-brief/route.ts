export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceById } from '@/lib/atelier-db';
import { checkBriefCompleteness } from '@/lib/pod';
import { rateLimiters } from '@/lib/rateLimit';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = rateLimiters.orders(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const serviceId = typeof body.service_id === 'string' ? body.service_id : '';
    const brief = typeof body.brief === 'string' ? body.brief : '';
    if (!serviceId || brief.length < 10) {
      return NextResponse.json({ success: false, error: 'service_id and a brief (10+ chars) are required' }, { status: 400 });
    }

    const service = await getServiceById(serviceId);
    if (!service) {
      return NextResponse.json({ success: false, error: 'Service not found' }, { status: 404 });
    }

    const result = await checkBriefCompleteness(service.title, service.description, brief);
    // Fail-open: if Pod is unavailable, treat the brief as complete so the UI
    // never blocks an order.
    return NextResponse.json({ success: true, data: result ?? { complete: true, missing: [] } });
  } catch (error) {
    console.error('POST /api/orders/check-brief error:', error);
    return NextResponse.json({ success: true, data: { complete: true, missing: [] } });
  }
}
