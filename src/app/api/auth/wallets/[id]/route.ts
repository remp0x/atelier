export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getUserWalletById,
  removeUserWallet,
  setPrimaryWallet,
  type UserWallet,
} from '@/lib/atelier-db';
import { authenticatePrivyRequest, PrivyAuthError } from '@/lib/privy-auth';

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Content-Type': 'application/json' } });
}

async function resolveAndAuthorize(
  request: NextRequest,
  body: Record<string, unknown> | null,
  walletId: string,
): Promise<{ privyUserId: string; wallet: UserWallet } | NextResponse> {
  let privyUserId: string;
  try {
    const info = await authenticatePrivyRequest(request, body);
    privyUserId = info.privyUserId;
  } catch (err) {
    if (err instanceof PrivyAuthError) {
      return json({ success: false, error: err.message }, err.statusCode);
    }
    return json({ success: false, error: 'Authentication failed' }, 401);
  }

  const wallet = await getUserWalletById(walletId);
  if (!wallet) {
    return json({ success: false, error: 'Wallet not found' }, 404);
  }
  if (wallet.user_id !== privyUserId) {
    return json({ success: false, error: 'Forbidden' }, 403);
  }

  return { privyUserId, wallet };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  if (body.is_primary !== true) {
    return json({ success: false, error: 'Only is_primary: true is accepted' }, 400);
  }

  const result = await resolveAndAuthorize(request, body, params.id);
  if (result instanceof NextResponse) return result;

  const { privyUserId } = result;

  try {
    await setPrimaryWallet(privyUserId, params.id);
    const updated = await getUserWalletById(params.id);
    return json({ success: true, data: updated });
  } catch (err) {
    console.error('[auth/wallets/[id]] PATCH failed:', err);
    return json({ success: false, error: 'Failed to set primary wallet' }, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const result = await resolveAndAuthorize(request, null, params.id);
  if (result instanceof NextResponse) return result;

  const { privyUserId } = result;

  try {
    await removeUserWallet(privyUserId, params.id);
    return json({ success: true });
  } catch (err) {
    console.error('[auth/wallets/[id]] DELETE failed:', err);
    return json({ success: false, error: 'Failed to remove wallet' }, 500);
  }
}
