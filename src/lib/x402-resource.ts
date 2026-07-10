import type { NextRequest } from 'next/server';
import { getServiceById, type Service } from '@/lib/atelier-db';
import {
  buildPaymentRequirements,
  buildX402ChallengeResponse,
  parsePaymentChain,
  supportedPaymentChains,
  type PaymentChain,
  type PaymentRequirements,
} from '@/lib/x402';
import { getApiOrigin } from '@/lib/origins';

/**
 * Whether a service is payable via x402: fixed-price with a strictly-positive price.
 * Zero-price ($0.00) and quote-based services are excluded -- x402 is pay-per-call, so
 * advertising them as paid resources is meaningless and trips discovery validators.
 */
export function isX402PayableService(s: Pick<Service, 'price_usd' | 'price_type'>): boolean {
  return s.price_type === 'fixed' && !!s.price_usd && parseFloat(s.price_usd) > 0;
}

export function resolveOrigin(request: NextRequest): string {
  try {
    return getApiOrigin(request.nextUrl.origin);
  } catch {
    return getApiOrigin();
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

  if (!isX402PayableService(service)) {
    return jsonError(
      'This service is not payable via x402 (quote-based or zero-price). Use the standard order flow.',
      400,
    );
  }

  let requestedChain: PaymentChain = 'solana';
  if (chainParam) {
    const parsed = parsePaymentChain(chainParam);
    if (!parsed) return jsonError(`Unsupported chain: ${chainParam}`, 400);
    requestedChain = parsed;
  }

  const evmEligible = typeof service.payout_address_base === 'string' && service.payout_address_base.length > 0;

  const chainOrder: PaymentChain[] = [
    requestedChain,
    ...supportedPaymentChains().filter((c) => c !== requestedChain),
  ].filter((c) => c === 'solana' || evmEligible);

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
