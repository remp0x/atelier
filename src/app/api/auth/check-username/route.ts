export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { isUsernameAvailable } from '@/lib/atelier-db';
import { rateLimit } from '@/lib/rateLimit';

const checkUsernameRateLimit = rateLimit(60, 60 * 1000);

const USERNAME_SLUG_REGEX = /^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])?$/;

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Content-Type': 'application/json' } });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const limited = checkUsernameRateLimit(request);
  if (limited) return limited;

  const u = request.nextUrl.searchParams.get('u') ?? '';
  const trimmed = u.trim().toLowerCase();

  if (!trimmed || trimmed.length < 3 || trimmed.length > 30 || !USERNAME_SLUG_REGEX.test(trimmed)) {
    return json({ available: false, reason: 'invalid' });
  }

  try {
    const available = await isUsernameAvailable(trimmed);
    return json({ available, reason: available ? null : 'taken' });
  } catch (err) {
    console.error('[check-username] error:', err);
    return json({ available: false, reason: 'error' }, 500);
  }
}
