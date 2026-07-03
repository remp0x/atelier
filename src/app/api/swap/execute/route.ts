export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { tryResolvePrivyUserId } from '@/lib/privy-auth';
import { rateLimit } from '@/lib/rateLimit';

/** Second half of the Jupiter Swap v2 flow: submit the user-signed order. */
const JUPITER_EXECUTE_URL = 'https://api.jup.ag/swap/v2/execute';
const BASE64_RE = /^[A-Za-z0-9+/=]+$/;

const swapRateLimit = rateLimit(30, 60 * 60 * 1000);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = swapRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  const privyUserId = await tryResolvePrivyUserId(request, null);
  if (!privyUserId) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const signedTransaction = typeof body.signed_transaction === 'string' ? body.signed_transaction.trim() : '';
  const requestId = typeof body.request_id === 'string' ? body.request_id.trim() : '';

  if (!signedTransaction || signedTransaction.length > 20_000 || !BASE64_RE.test(signedTransaction) || !requestId) {
    return NextResponse.json({ success: false, error: 'signed_transaction and request_id are required' }, { status: 400 });
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (process.env.JUPITER_API_KEY) headers['x-api-key'] = process.env.JUPITER_API_KEY;

  try {
    const res = await fetch(JUPITER_EXECUTE_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ signedTransaction, requestId }),
      signal: AbortSignal.timeout(60_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      const detail = data && typeof data.error === 'string' ? data.error : `Jupiter execute failed: ${res.status}`;
      return NextResponse.json({ success: false, error: detail }, { status: 502 });
    }
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof DOMException && err.name === 'TimeoutError'
      ? 'Jupiter execute timed out'
      : 'Jupiter execute failed';
    console.error('[swap/execute]', err);
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
