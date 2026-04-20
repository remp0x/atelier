export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireWalletAuth, WalletAuthError } from '@/lib/solana-auth';
import {
  buildClearedSessionCookie,
  buildSessionCookie,
  createSessionForWallet,
  destroySession,
} from '@/lib/session';
import { ensureProfileExists } from '@/lib/atelier-db';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { wallet, wallet_sig, wallet_sig_ts } = body ?? {};

    if (!wallet || !wallet_sig || typeof wallet_sig_ts !== 'number') {
      return NextResponse.json(
        { success: false, error: 'wallet, wallet_sig, and wallet_sig_ts are required' },
        { status: 400 },
      );
    }

    let verifiedWallet: string;
    try {
      verifiedWallet = requireWalletAuth({ wallet, wallet_sig, wallet_sig_ts });
    } catch (err) {
      const msg = err instanceof WalletAuthError ? err.message : 'Authentication failed';
      return NextResponse.json({ success: false, error: msg }, { status: 401 });
    }

    const { id, expiresAt } = await createSessionForWallet(verifiedWallet);
    ensureProfileExists(verifiedWallet).catch(() => {});

    const response = NextResponse.json({
      success: true,
      data: { wallet: verifiedWallet, expires_at: expiresAt.toISOString() },
    });
    response.headers.set('Set-Cookie', buildSessionCookie(id, expiresAt));
    return response;
  } catch (err) {
    console.error('Session POST failed:', err);
    return NextResponse.json({ success: false, error: 'Failed to create session' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    await destroySession(request);
  } catch (err) {
    console.error('Session DELETE failed:', err);
  }
  const response = NextResponse.json({ success: true });
  response.headers.set('Set-Cookie', buildClearedSessionCookie());
  return response;
}
