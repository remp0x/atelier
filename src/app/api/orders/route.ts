export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceById, createServiceOrder, getOrdersByWallet, ensureProfileExists, isEscrowTxHashUsed } from '@/lib/atelier-db';
import { isActivePartnerSlug } from '@/lib/partners-db';
import { WalletAuthError } from '@/lib/solana-auth';
import { authenticateUserRequest } from '@/lib/session';
import { rateLimiters } from '@/lib/rateLimit';
import { notifyAgentWebhook } from '@/lib/webhook';
import { notifyProvider } from '@/lib/notifications';
import {
  parseX402Header,
  buildPaymentRequirements,
  buildPaymentRequiredResponse,
  verifyX402Payment,
  computeTotalWithFee,
} from '@/lib/x402';

export async function POST(request: NextRequest): Promise<NextResponse | Response> {
  const rateLimitResponse = rateLimiters.orders(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const { service_id, brief, reference_urls, reference_images, requirement_answers, client_wallet } = body;

    if (!service_id || !brief) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: service_id, brief' },
        { status: 400 },
      );
    }

    if (typeof brief !== 'string' || brief.length < 10 || brief.length > 1000) {
      return NextResponse.json(
        { success: false, error: 'Brief must be 10-1000 characters' },
        { status: 400 },
      );
    }

    if (reference_urls && (!Array.isArray(reference_urls) || reference_urls.length > 5)) {
      return NextResponse.json(
        { success: false, error: 'reference_urls must be an array of max 5 URLs' },
        { status: 400 },
      );
    }

    if (reference_urls && Array.isArray(reference_urls)) {
      for (const url of reference_urls) {
        if (typeof url !== 'string') {
          return NextResponse.json(
            { success: false, error: 'reference_urls must contain valid URL strings' },
            { status: 400 },
          );
        }
        try {
          const parsed = new URL(url);
          if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            return NextResponse.json(
              { success: false, error: `Invalid reference URL scheme: ${url}` },
              { status: 400 },
            );
          }
        } catch {
          return NextResponse.json(
            { success: false, error: `Invalid reference URL: ${url}` },
            { status: 400 },
          );
        }
      }
    }

    if (reference_images) {
      if (!Array.isArray(reference_images) || reference_images.length > 3) {
        return NextResponse.json(
          { success: false, error: 'reference_images must be an array of max 3 URLs' },
          { status: 400 },
        );
      }
      for (const url of reference_images) {
        if (typeof url !== 'string' || !url.includes('.vercel-storage.com')) {
          return NextResponse.json(
            { success: false, error: 'reference_images must contain valid Vercel Blob URLs' },
            { status: 400 },
          );
        }
      }
    }

    const service = await getServiceById(service_id);
    if (!service || !service.active) {
      return NextResponse.json(
        { success: false, error: 'Service not found or inactive' },
        { status: 404 },
      );
    }

    const txSignature = parseX402Header(request.headers.get('X-PAYMENT'));

    if (txSignature) {
      return handleX402Order(body, service, txSignature);
    }

    if (!client_wallet) {
      if (!service.price_usd || service.price_type === 'quote') {
        return NextResponse.json(
          { success: false, error: 'Quote-based services require wallet auth. x402 is only available for fixed-price services.' },
          { status: 400 },
        );
      }
      const requirements = buildPaymentRequirements({
        priceUsd: service.price_usd,
        serviceTitle: service.title,
        serviceId: service.id,
      });
      return buildPaymentRequiredResponse(requirements);
    }

    let verifiedWallet: string;
    try {
      verifiedWallet = await authenticateUserRequest(request, body, client_wallet);
    } catch (err) {
      const msg = err instanceof WalletAuthError ? err.message : 'Authentication failed';
      return NextResponse.json({ success: false, error: msg }, { status: 401 });
    }

    ensureProfileExists(verifiedWallet).catch(() => {});

    let referralPartner: string | undefined;
    const rawReferral = typeof body.referral_partner === 'string' ? body.referral_partner.trim().toLowerCase() : '';
    if (rawReferral && /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(rawReferral)) {
      if (await isActivePartnerSlug(rawReferral)) {
        referralPartner = rawReferral;
      }
    }

    const quotedPrice = ['fixed', 'weekly', 'monthly'].includes(service.price_type) ? service.price_usd : undefined;

    const order = await createServiceOrder({
      service_id,
      client_wallet,
      provider_agent_id: service.agent_id,
      brief,
      reference_urls: reference_urls || undefined,
      reference_images: reference_images || undefined,
      quoted_price_usd: quotedPrice,
      quota_total: service.quota_limit || 0,
      requirement_answers: requirement_answers || undefined,
      referral_partner: referralPartner,
    });

    notifyAgentWebhook(service.agent_id, {
      event: 'order.created',
      order_id: order.id,
      data: { service_id, brief, reference_images: reference_images || undefined, requirement_answers: requirement_answers || undefined, status: order.status, service_title: service.title },
    });

    notifyProvider('provider_order_received', service.agent_id, {
      orderId: order.id,
      agentName: service.title,
      serviceTitle: service.title,
    });

    return NextResponse.json({ success: true, data: order });
  } catch (error) {
    console.error('Error creating wallet order:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create order' },
      { status: 500 },
    );
  }
}

async function handleX402Order(
  body: Record<string, unknown>,
  service: { id: string; agent_id: string; title: string; price_usd: string; price_type: string; quota_limit: number | null },
  txSignature: string,
): Promise<NextResponse> {
  const { brief, reference_urls, reference_images, requirement_answers } = body as {
    brief: string;
    reference_urls?: string[];
    reference_images?: string[];
    requirement_answers?: Record<string, string>;
  };

  if (!service.price_usd || service.price_type === 'quote') {
    return NextResponse.json(
      { success: false, error: 'Quote-based services cannot be paid via x402' },
      { status: 400 },
    );
  }

  const alreadyUsed = await isEscrowTxHashUsed(txSignature);
  if (alreadyUsed) {
    return NextResponse.json(
      { success: false, error: 'Transaction signature already used for a previous order' },
      { status: 409 },
    );
  }

  const { totalUsd, feeUsd } = computeTotalWithFee(service.price_usd);

  const verification = await verifyX402Payment(txSignature, totalUsd);
  if (!verification.verified) {
    return NextResponse.json(
      { success: false, error: `Payment verification failed: ${verification.error}` },
      { status: 402 },
    );
  }

  const order = await createServiceOrder({
    service_id: service.id,
    client_wallet: verification.payerWallet!,
    provider_agent_id: service.agent_id,
    brief,
    reference_urls: reference_urls || undefined,
    reference_images: reference_images || undefined,
    quoted_price_usd: service.price_usd,
    quota_total: service.quota_limit || 0,
    requirement_answers: requirement_answers || undefined,
    client_type: 'agent_x402',
    payment_tx_signature: txSignature,
    status_override: 'paid',
  });

  notifyAgentWebhook(service.agent_id, {
    event: 'order.created',
    order_id: order.id,
    data: {
      service_id: service.id,
      brief,
      reference_images: reference_images || undefined,
      requirement_answers: requirement_answers || undefined,
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

  return NextResponse.json({
    success: true,
    data: order,
    x402: {
      payment_verified: true,
      payer_wallet: verification.payerWallet,
      total_charged_usd: totalUsd,
      platform_fee_usd: feeUsd,
      tx_signature: txSignature,
    },
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = rateLimiters.orders(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    let wallet: string;
    try {
      wallet = await authenticateUserRequest(request, {
        wallet: request.nextUrl.searchParams.get('wallet'),
        wallet_sig: request.nextUrl.searchParams.get('wallet_sig'),
        wallet_sig_ts: request.nextUrl.searchParams.get('wallet_sig_ts'),
      });
    } catch (err) {
      const msg = err instanceof WalletAuthError ? err.message : 'Authentication failed';
      return NextResponse.json({ success: false, error: msg }, { status: 401 });
    }

    ensureProfileExists(wallet).catch(() => {});

    const orders = await getOrdersByWallet(wallet);
    return NextResponse.json({ success: true, data: orders });
  } catch (error) {
    console.error('Error fetching wallet orders:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch orders' },
      { status: 500 },
    );
  }
}
