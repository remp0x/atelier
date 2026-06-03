import type { NextRequest } from 'next/server';
import { getServiceById } from '@/lib/atelier-db';
import {
  buildPaymentRequirements,
  buildX402ChallengeResponse,
  type PaymentChain,
  type PaymentRequirements,
} from '@/lib/x402';

const DEFAULT_SITE_ORIGIN = 'https://atelierai.xyz';

export function resolveOrigin(request: NextRequest): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  try {
    return request.nextUrl.origin;
  } catch {
    return DEFAULT_SITE_ORIGIN;
  }
}

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Resolves a service to an x402scan-conformant HTTP 402 challenge (or a JSON error
 * Response). Shared by the query route (/api/x402/discover?service_id=) and the
 * path-param route (/api/x402/discover/{service_id}) so both emit identical bodies.
 * `origin` is used to build the canonical resource URL advertised in each accept entry.
 */
export async function buildServiceChallenge(
  serviceId: string,
  chainParam: string | null,
  origin: string,
): Promise<Response> {
  const service = await getServiceById(serviceId);
  if (!service || !service.active) {
    return jsonError('Service not found or inactive', 404);
  }

  if (!service.price_usd || service.price_type === 'quote') {
    return jsonError('Quote-based services are not available via x402. Use the standard order flow.', 400);
  }

  let requestedChain: PaymentChain = 'solana';
  if (chainParam === 'base') requestedChain = 'base';
  else if (chainParam && chainParam !== 'solana') {
    return jsonError(`Unsupported chain: ${chainParam}`, 400);
  }

  const baseEligible = typeof service.payout_address_base === 'string' && service.payout_address_base.length > 0;

  const chainOrder: PaymentChain[] =
    requestedChain === 'base' && baseEligible
      ? ['base', 'solana']
      : ['solana', ...(baseEligible ? (['base'] as PaymentChain[]) : [])];

  const requirements: PaymentRequirements[] = [];
  for (const chain of chainOrder) {
    try {
      requirements.push(
        buildPaymentRequirements({
          priceUsd: service.price_usd,
          serviceTitle: service.title,
          serviceId: service.id,
          chain,
        }),
      );
    } catch {
      // treasury not configured for this chain -- skip
    }
  }

  if (requirements.length === 0) {
    return jsonError('No payment rail configured for this service', 503);
  }

  return buildX402ChallengeResponse({
    requirements,
    resourceUrl: `${origin}/api/x402/discover/${service.id}`,
    name: service.title,
    description: `Atelier: ${service.title}`,
  });
}
