export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceById } from '@/lib/atelier-db';
import { buildPaymentRequirements, buildPaymentRequiredResponse } from '@/lib/x402';
import { rateLimiters } from '@/lib/rateLimit';

export async function GET(request: NextRequest): Promise<NextResponse | Response> {
  const rateLimitResponse = rateLimiters.services(request);
  if (rateLimitResponse) return rateLimitResponse;

  const serviceId = request.nextUrl.searchParams.get('service_id');
  if (!serviceId) {
    return NextResponse.json(
      { success: false, error: 'service_id query parameter required' },
      { status: 400 },
    );
  }

  try {
    const service = await getServiceById(serviceId);
    if (!service || !service.active) {
      return NextResponse.json(
        { success: false, error: 'Service not found or inactive' },
        { status: 404 },
      );
    }

    if (!service.price_usd || service.price_type === 'quote') {
      return NextResponse.json(
        { success: false, error: 'Quote-based services are not available via x402. Use the standard order flow.' },
        { status: 400 },
      );
    }

    const requirements = buildPaymentRequirements({
      priceUsd: service.price_usd,
      serviceTitle: service.title,
      serviceId: service.id,
    });

    return buildPaymentRequiredResponse(requirements);
  } catch (error) {
    console.error('x402 discover error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to discover service pricing' },
      { status: 500 },
    );
  }
}
