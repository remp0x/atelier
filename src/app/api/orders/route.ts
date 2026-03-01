import { NextRequest, NextResponse } from 'next/server';
import { getServiceById, createServiceOrder, getOrdersByWallet } from '@/lib/atelier-db';
import { requireWalletAuth, WalletAuthError } from '@/lib/solana-auth';
import { rateLimiters } from '@/lib/rateLimit';
import { notifyAgentWebhook } from '@/lib/webhook';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = rateLimiters.orders(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const { service_id, brief, reference_urls, client_wallet } = body;

    if (!service_id || !brief || !client_wallet) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: service_id, brief, client_wallet' },
        { status: 400 },
      );
    }

    let verifiedWallet: string;
    try {
      verifiedWallet = requireWalletAuth(body);
    } catch (err) {
      const msg = err instanceof WalletAuthError ? err.message : 'Authentication failed';
      return NextResponse.json({ success: false, error: msg }, { status: 401 });
    }

    if (verifiedWallet !== client_wallet) {
      return NextResponse.json(
        { success: false, error: 'Authenticated wallet does not match client_wallet' },
        { status: 403 },
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

    const service = await getServiceById(service_id);
    if (!service || !service.active) {
      return NextResponse.json(
        { success: false, error: 'Service not found or inactive' },
        { status: 404 },
      );
    }

    const quotedPrice = service.price_type === 'fixed' ? service.price_usd : undefined;

    const order = await createServiceOrder({
      service_id,
      client_wallet,
      provider_agent_id: service.agent_id,
      brief,
      reference_urls: reference_urls || undefined,
      quoted_price_usd: quotedPrice,
      quota_total: service.quota_limit || 0,
    });

    notifyAgentWebhook(service.agent_id, {
      event: 'order.created',
      order_id: order.id,
      data: { service_id, brief, status: order.status },
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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = rateLimiters.orders(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const wallet = request.nextUrl.searchParams.get('wallet');
    if (!wallet) {
      return NextResponse.json(
        { success: false, error: 'wallet query parameter required' },
        { status: 400 },
      );
    }

    const walletSig = request.nextUrl.searchParams.get('wallet_sig');
    const walletSigTs = request.nextUrl.searchParams.get('wallet_sig_ts');

    if (!walletSig || !walletSigTs) {
      return NextResponse.json(
        { success: false, error: 'wallet_sig and wallet_sig_ts query parameters required' },
        { status: 401 },
      );
    }

    try {
      requireWalletAuth({ wallet, wallet_sig: walletSig, wallet_sig_ts: Number(walletSigTs) });
    } catch (err) {
      const msg = err instanceof WalletAuthError ? err.message : 'Authentication failed';
      return NextResponse.json({ success: false, error: msg }, { status: 401 });
    }

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
