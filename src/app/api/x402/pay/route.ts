export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getServiceById,
  getAtelierAgent,
  agentIsMarketable,
  createServiceOrder,
  isPaymentTxSignatureUsed,
  DuplicateOrderPaymentError,
  type Service,
} from '@/lib/atelier-db';
import {
  parseX402Header,
  buildPaymentRequirements,
  buildPaymentRequiredResponse,
  verifyX402Payment,
  computeTotalWithFee,
  networkToChain,
  detectChainFromTxRef,
  type PaymentChain,
} from '@/lib/x402';
import {
  CDP_FACILITATOR_ENABLED,
  buildCdpV2PaymentRequirements,
  buildCdpV1402Response,
  buildCdpBazaarExtension,
  buildCdpV2PaymentPayload,
  decodeXPaymentPayload,
  encodeXPaymentResponse,
  verifyViaCdpFacilitator,
  settleViaCdpFacilitator,
  type CdpV2PaymentRequirements,
  type CdpResourceInfo,
  type CdpBazaarExtension,
} from '@/lib/cdp-facilitator';
import { settleX402ProviderPayout } from '@/lib/x402-settle';
import { rateLimiters } from '@/lib/rateLimit';
import { notifyAgentWebhook } from '@/lib/webhook';
import { notifyProvider } from '@/lib/notifications';
import { resolveExternalAgentByApiKey } from '@/lib/atelier-auth';

// Optional buyer-agent attribution: if the paying agent includes its API key
// (Authorization: Bearer atelier_...), attribute the order to it. Paying via
// x402 never REQUIRES registration -- this only adds attribution when offered.
async function resolveOptionalBuyerAgentId(request: NextRequest): Promise<string | null> {
  try {
    const buyer = await resolveExternalAgentByApiKey(request);
    return buyer.id;
  } catch {
    return null;
  }
}

interface InstantHireBody {
  service_id?: string;
  brief?: string;
  requirements?: Record<string, string>;
}

// Bazaar discovery metadata for the instant-hire resource (POST + JSON body).
const CDP_BAZAAR_INPUT_BODY: Record<string, unknown> = {
  brief: 'Generate a 5-second product video of a sneaker on a rotating platform',
  requirements: {},
};
const CDP_BAZAAR_INPUT_PROPERTIES: Record<string, unknown> = {
  brief: { type: 'string', description: 'What you want the agent to produce' },
  requirements: { type: 'object', description: 'Optional answers to the service requirements' },
};
const CDP_BAZAAR_OUTPUT_EXAMPLE: Record<string, unknown> = {
  order_id: 'ord_1780278669252_r2oi99c7d',
  status: 'paid',
  status_url: 'https://atelierai.xyz/api/orders/ord_1780278669252_r2oi99c7d',
};

function getOrigin(request: NextRequest): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  return request.nextUrl.origin;
}

function resolveQueryChain(param: string | null, fallback: PaymentChain): PaymentChain {
  if (param === 'base') return 'base';
  if (param === 'solana') return 'solana';
  return fallback;
}

function serviceBaseEligible(service: Service): boolean {
  return typeof service.payout_address_base === 'string' && service.payout_address_base.length > 0;
}

const BASE_NOT_AVAILABLE = 'This service is not available on Base yet: the provider has not configured a Base payout wallet.';

interface CdpServiceChallenge {
  requirements: CdpV2PaymentRequirements;
  resource: CdpResourceInfo;
  bazaar: CdpBazaarExtension;
}

function cdpChallengeForService(service: Service, origin: string): CdpServiceChallenge | null {
  const treasury = process.env.ATELIER_TREASURY_BASE;
  if (!treasury) return null;
  const { totalUsd } = computeTotalWithFee(service.price_usd);
  return {
    requirements: buildCdpV2PaymentRequirements({ totalUsd, payTo: treasury }),
    resource: {
      // Path-based (no query string): CDP Bazaar drops query-string resources, and it
      // validates the cataloged URL by fetching its 402. The /api/x402/pay/<id> alias
      // (next.config.js rewrite) serves the Base 402 that matches the settled payment.
      url: `${origin}/api/x402/pay/${service.id}`,
      description: `Atelier: ${service.title} (${service.id})`,
      mimeType: 'application/json',
    },
    bazaar: buildCdpBazaarExtension({
      inputBody: CDP_BAZAAR_INPUT_BODY,
      inputProperties: CDP_BAZAAR_INPUT_PROPERTIES,
      outputExample: CDP_BAZAAR_OUTPUT_EXAMPLE,
    }),
  };
}

export async function GET(request: NextRequest): Promise<NextResponse | Response> {
  const rateLimitResponse = rateLimiters.orders(request);
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

    const chain = resolveQueryChain(request.nextUrl.searchParams.get('chain'), 'solana');

    if (chain === 'base' && !serviceBaseEligible(service)) {
      return NextResponse.json({ success: false, error: BASE_NOT_AVAILABLE }, { status: 400 });
    }

    if (chain === 'base' && CDP_FACILITATOR_ENABLED) {
      const challenge = cdpChallengeForService(service, getOrigin(request));
      if (challenge) {
        return buildCdpV1402Response({ requirements: challenge.requirements, resource: challenge.resource, error: 'X-PAYMENT header required to access this resource' });
      }
    }

    const requirements = buildPaymentRequirements({
      priceUsd: service.price_usd,
      serviceTitle: service.title,
      serviceId: service.id,
      chain,
    });

    return buildPaymentRequiredResponse(requirements);
  } catch (error) {
    console.error('x402 pay discover error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to discover service pricing' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse | Response> {
  const rateLimitResponse = rateLimiters.orders(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    let body: InstantHireBody = {};
    try {
      const parsed = (await request.json()) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        body = parsed as InstantHireBody;
      }
    } catch {
      // Standard x402 clients replay the request with only the X-PAYMENT header
      // and no JSON body; tolerate an empty/absent body in that case.
    }

    const queryServiceId = request.nextUrl.searchParams.get('service_id');
    const serviceId = queryServiceId || (typeof body.service_id === 'string' ? body.service_id : null);
    if (!serviceId) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: service_id (query param or body)' },
        { status: 400 },
      );
    }

    const brief = typeof body.brief === 'string' && body.brief.length > 0 ? body.brief : 'Instant hire via x402';
    const requirementAnswers =
      body.requirements && typeof body.requirements === 'object' && !Array.isArray(body.requirements)
        ? body.requirements
        : undefined;

    const service = await getServiceById(serviceId);
    if (!service || !service.active) {
      return NextResponse.json(
        { success: false, error: 'Service not found or inactive' },
        { status: 404 },
      );
    }

    if (!service.price_usd || service.price_type === 'quote') {
      return NextResponse.json(
        { success: false, error: 'Quote-based services cannot be paid via x402' },
        { status: 400 },
      );
    }

    const providerAgent = await getAtelierAgent(service.agent_id);
    if (!providerAgent || !agentIsMarketable(providerAgent)) {
      return NextResponse.json(
        { success: false, error: 'This agent is not yet available for hire. The agent must verify ownership (wallet, X, or sign-in) first.' },
        { status: 403 },
      );
    }

    // v1 clients send `X-PAYMENT`; x402 v2 clients send `PAYMENT-SIGNATURE`. Accept both.
    const paymentHeader = request.headers.get('X-PAYMENT') ?? request.headers.get('PAYMENT-SIGNATURE');
    const cdpPayload = CDP_FACILITATOR_ENABLED ? decodeXPaymentPayload(paymentHeader) : null;
    if (cdpPayload) {
      if (!serviceBaseEligible(service)) {
        return NextResponse.json(
          { success: false, error: `${BASE_NOT_AVAILABLE} No payment was taken.` },
          { status: 409 },
        );
      }
      return handleCdpHire(request, service, cdpPayload, brief, requirementAnswers);
    }

    const headerChain = networkToChain(request.headers.get('X-Payment-Network'));
    const txSignature = parseX402Header(paymentHeader);

    if (!txSignature) {
      const chain = resolveQueryChain(request.nextUrl.searchParams.get('chain'), headerChain ?? 'solana');
      if (chain === 'base' && !serviceBaseEligible(service)) {
        return NextResponse.json({ success: false, error: BASE_NOT_AVAILABLE }, { status: 400 });
      }
      if (chain === 'base' && CDP_FACILITATOR_ENABLED) {
        const challenge = cdpChallengeForService(service, getOrigin(request));
        if (challenge) {
          return buildCdpV1402Response({ requirements: challenge.requirements, resource: challenge.resource, error: 'X-PAYMENT header required to access this resource' });
        }
      }
      const requirements = buildPaymentRequirements({
        priceUsd: service.price_usd,
        serviceTitle: service.title,
        serviceId: service.id,
        chain,
      });
      return buildPaymentRequiredResponse(requirements);
    }

    return handleInstantHire(request, service, txSignature, headerChain, brief, requirementAnswers);
  } catch (error) {
    console.error('x402 pay error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process instant hire' },
      { status: 500 },
    );
  }
}

async function recordPaidOrderAndPayout(
  service: Service,
  payerWallet: string,
  txSignature: string,
  paymentChain: PaymentChain,
  brief: string,
  requirementAnswers: Record<string, string> | undefined,
  buyerAgentId: string | null,
): Promise<{
  order: Awaited<ReturnType<typeof createServiceOrder>>;
  payout: Awaited<ReturnType<typeof settleX402ProviderPayout>>;
}> {
  const paymentMethod = paymentChain === 'base' ? 'usdc-base' : 'usdc-sol';

  const order = await createServiceOrder({
    service_id: service.id,
    client_agent_id: buyerAgentId ?? undefined,
    client_wallet: payerWallet,
    provider_agent_id: service.agent_id,
    brief,
    quoted_price_usd: service.price_usd,
    quota_total: service.quota_limit || 0,
    requirement_answers: requirementAnswers,
    client_type: 'agent_x402',
    payment_tx_signature: txSignature,
    status_override: 'paid',
    payment_chain: paymentChain,
    payer_address: payerWallet,
    payment_method: paymentMethod,
  });

  notifyAgentWebhook(service.agent_id, {
    event: 'order.created',
    order_id: order.id,
    data: {
      service_id: service.id,
      brief,
      requirement_answers: requirementAnswers,
      status: 'paid',
      service_title: service.title,
      payment_method: 'x402',
    },
  });

  notifyProvider('provider_order_received', service.agent_id, {
    orderId: order.id,
    agentName: service.title,
    serviceTitle: service.title,
  });

  const { priceUsd } = computeTotalWithFee(service.price_usd);
  const payout = await settleX402ProviderPayout({
    orderId: order.id,
    providerAgentId: service.agent_id,
    providerNetUsd: priceUsd,
    paymentChain,
  });

  if (payout.paid) {
    notifyAgentWebhook(service.agent_id, {
      event: 'order.payout_sent',
      order_id: order.id,
      data: {
        amount_usd: payout.amountUsd,
        chain: payout.chain,
        tx_hash: payout.txHash,
        destination: payout.destination,
      },
    });
  } else {
    notifyAgentWebhook(service.agent_id, {
      event: 'order.payout_failed',
      order_id: order.id,
      data: {
        reason: payout.error ?? 'payout failed',
        chain: payout.chain,
        amount_usd: payout.amountUsd,
        hint:
          payout.chain === 'base'
            ? 'Set payout_address_base via PATCH /api/agents/me to receive Base payouts, then retry the payout.'
            : 'Set payout_wallet via PATCH /api/agents/me, then retry the payout.',
      },
    });
  }

  return { order, payout };
}

async function handleInstantHire(
  request: NextRequest,
  service: Service,
  txSignature: string,
  chainHint: PaymentChain | null,
  brief: string,
  requirementAnswers: Record<string, string> | undefined,
): Promise<NextResponse> {
  const alreadyUsed = await isPaymentTxSignatureUsed(txSignature);
  if (alreadyUsed) {
    return NextResponse.json(
      { success: false, error: 'Transaction signature already used for a previous order' },
      { status: 409 },
    );
  }

  const { totalUsd, feeUsd, priceUsd } = computeTotalWithFee(service.price_usd);

  const resolvedChain: PaymentChain | null = chainHint ?? detectChainFromTxRef(txSignature);
  const verification = await verifyX402Payment(txSignature, totalUsd, resolvedChain);
  if (!verification.verified || !verification.payerWallet) {
    return NextResponse.json(
      { success: false, error: `Payment verification failed: ${verification.error}` },
      { status: 402 },
    );
  }

  const paymentChain: PaymentChain = verification.chain ?? 'solana';
  const buyerAgentId = await resolveOptionalBuyerAgentId(request);
  let order: Awaited<ReturnType<typeof recordPaidOrderAndPayout>>['order'];
  let payout: Awaited<ReturnType<typeof recordPaidOrderAndPayout>>['payout'];
  try {
    ({ order, payout } = await recordPaidOrderAndPayout(
      service,
      verification.payerWallet,
      txSignature,
      paymentChain,
      brief,
      requirementAnswers,
      buyerAgentId,
    ));
  } catch (err) {
    if (err instanceof DuplicateOrderPaymentError) {
      return NextResponse.json(
        { success: false, error: 'Transaction signature already used for a previous order' },
        { status: 409 },
      );
    }
    throw err;
  }

  const origin = getOrigin(request);

  return NextResponse.json({
    success: true,
    data: {
      order_id: order.id,
      status: order.status,
      status_url: `${origin}/api/orders/${order.id}`,
      poll_hint: 'GET status_url to check generation progress until status is delivered or completed.',
      x402: {
        payment_verified: true,
        payer_wallet: verification.payerWallet,
        total_charged_usd: totalUsd,
        platform_fee_usd: feeUsd,
        provider_payout_usd: priceUsd,
        tx_signature: txSignature,
        payment_chain: paymentChain,
        payout: {
          attempted: payout.attempted,
          paid: payout.paid,
          tx_hash: payout.txHash,
          destination: payout.destination,
          chain: payout.chain,
          error: payout.error,
        },
      },
    },
  });
}

async function handleCdpHire(
  request: NextRequest,
  service: Service,
  paymentPayload: Record<string, unknown>,
  brief: string,
  requirementAnswers: Record<string, string> | undefined,
): Promise<NextResponse | Response> {
  const origin = getOrigin(request);
  const challenge = cdpChallengeForService(service, origin);
  if (!challenge) {
    return NextResponse.json(
      { success: false, error: 'Base treasury (ATELIER_TREASURY_BASE) not configured for CDP settlement' },
      { status: 503 },
    );
  }

  // Re-wrap the buyer's payload as a v2 PaymentPayload carrying `resource` +
  // `extensions.bazaar` so a successful settle catalogs this resource in CDP Bazaar.
  const v2Payload = buildCdpV2PaymentPayload({
    buyerPayload: paymentPayload,
    requirements: challenge.requirements,
    resource: challenge.resource,
    bazaar: challenge.bazaar,
  });

  const verification = await verifyViaCdpFacilitator({ paymentPayload: v2Payload, paymentRequirements: challenge.requirements });
  if (!verification.isValid) {
    return NextResponse.json(
      { success: false, error: `CDP payment verification failed: ${verification.invalidReason ?? verification.error ?? 'invalid payment'}` },
      { status: 402 },
    );
  }

  const settlement = await settleViaCdpFacilitator({ paymentPayload: v2Payload, paymentRequirements: challenge.requirements });
  if (!settlement.success || !settlement.transaction) {
    return NextResponse.json(
      { success: false, error: `CDP settlement failed: ${settlement.errorReason ?? settlement.error ?? 'settle did not return a transaction'}` },
      { status: 402 },
    );
  }

  if (settlement.extensionResponses) {
    console.log(`CDP Bazaar extension for ${challenge.resource.url}: ${settlement.extensionResponses}`);
  }

  const payerWallet = settlement.payer ?? verification.payer;
  if (!payerWallet) {
    return NextResponse.json(
      { success: false, error: 'CDP settlement succeeded but no payer address was returned' },
      { status: 502 },
    );
  }

  const alreadyUsed = await isPaymentTxSignatureUsed(settlement.transaction);
  if (alreadyUsed) {
    return NextResponse.json(
      { success: false, error: 'Settlement transaction already used for a previous order' },
      { status: 409 },
    );
  }

  const { totalUsd, feeUsd, priceUsd } = computeTotalWithFee(service.price_usd);
  const buyerAgentId = await resolveOptionalBuyerAgentId(request);
  let order: Awaited<ReturnType<typeof recordPaidOrderAndPayout>>['order'];
  let payout: Awaited<ReturnType<typeof recordPaidOrderAndPayout>>['payout'];
  try {
    ({ order, payout } = await recordPaidOrderAndPayout(
      service,
      payerWallet,
      settlement.transaction,
      'base',
      brief,
      requirementAnswers,
      buyerAgentId,
    ));
  } catch (err) {
    if (err instanceof DuplicateOrderPaymentError) {
      return NextResponse.json(
        { success: false, error: 'Settlement transaction already used for a previous order' },
        { status: 409 },
      );
    }
    throw err;
  }

  const responseBody = {
    success: true,
    data: {
      order_id: order.id,
      status: order.status,
      status_url: `${origin}/api/orders/${order.id}`,
      poll_hint: 'GET status_url to check generation progress until status is delivered or completed.',
      x402: {
        payment_verified: true,
        settled_via: 'cdp-facilitator',
        cdp_extension: settlement.extensionResponses ?? null,
        payer_wallet: payerWallet,
        total_charged_usd: totalUsd,
        platform_fee_usd: feeUsd,
        provider_payout_usd: priceUsd,
        tx_signature: settlement.transaction,
        payment_chain: 'base' as const,
        payout: {
          attempted: payout.attempted,
          paid: payout.paid,
          tx_hash: payout.txHash,
          destination: payout.destination,
          chain: payout.chain,
          error: payout.error,
        },
      },
    },
  };

  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.set('X-PAYMENT-RESPONSE', encodeXPaymentResponse(settlement));
  return new NextResponse(JSON.stringify(responseBody), { status: 200, headers });
}
