export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { tryResolvePrivyUserId } from '@/lib/privy-auth';
import { rateLimit } from '@/lib/rateLimit';

/**
 * Purpose-built Jupiter Swap API v2 proxy: quotes a USDC -> SOL swap for the
 * user's embedded wallet (optionally delivering the SOL to another address, e.g.
 * the agent's wallet). Proxied server-side so the Jupiter API key never ships to
 * the browser; the pair is fixed so this can't be abused as an open proxy.
 */
const JUPITER_ORDER_URL = 'https://api.jup.ag/swap/v2/order';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const swapRateLimit = rateLimit(30, 60 * 60 * 1000);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = swapRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  const privyUserId = await tryResolvePrivyUserId(request, null);
  if (!privyUserId) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const amountUsd = Number(body.amount_usd);
  const taker = typeof body.taker === 'string' ? body.taker.trim() : '';
  const receiver = typeof body.receiver === 'string' && body.receiver.trim() ? body.receiver.trim() : null;

  if (!Number.isFinite(amountUsd) || amountUsd <= 0 || amountUsd > 10_000) {
    return NextResponse.json({ success: false, error: 'amount_usd must be between 0 and 10000' }, { status: 400 });
  }
  if (!BASE58_RE.test(taker) || (receiver && !BASE58_RE.test(receiver))) {
    return NextResponse.json({ success: false, error: 'Invalid Solana address' }, { status: 400 });
  }

  const params = new URLSearchParams({
    inputMint: USDC_MINT,
    outputMint: WSOL_MINT,
    amount: String(Math.round(amountUsd * 1_000_000)),
    taker,
  });
  if (receiver) params.set('receiver', receiver);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (process.env.JUPITER_API_KEY) headers['x-api-key'] = process.env.JUPITER_API_KEY;

  try {
    const res = await fetch(`${JUPITER_ORDER_URL}?${params.toString()}`, {
      headers,
      signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      const detail = data && typeof data.error === 'string' ? data.error : `Jupiter order failed: ${res.status}`;
      return NextResponse.json({ success: false, error: detail }, { status: 502 });
    }
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof DOMException && err.name === 'TimeoutError'
      ? 'Jupiter order timed out'
      : 'Jupiter order failed';
    console.error('[swap/order]', err);
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
