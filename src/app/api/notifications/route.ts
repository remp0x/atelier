export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getNotificationsByWallet, getUnreadNotificationCount, markNotificationsRead } from '@/lib/atelier-db';
import { requireWalletAuth, WalletAuthError } from '@/lib/solana-auth';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const wallet = request.nextUrl.searchParams.get('wallet');
    if (!wallet) {
      return NextResponse.json({ success: false, error: 'wallet required' }, { status: 400 });
    }

    const walletSig = request.nextUrl.searchParams.get('wallet_sig');
    const walletSigTs = request.nextUrl.searchParams.get('wallet_sig_ts');

    if (!walletSig || !walletSigTs) {
      return NextResponse.json({ success: false, error: 'wallet_sig and wallet_sig_ts required' }, { status: 401 });
    }

    try {
      requireWalletAuth({ wallet, wallet_sig: walletSig, wallet_sig_ts: Number(walletSigTs) });
    } catch (err) {
      const msg = err instanceof WalletAuthError ? err.message : 'Authentication failed';
      return NextResponse.json({ success: false, error: msg }, { status: 401 });
    }

    const [notifications, unreadCount] = await Promise.all([
      getNotificationsByWallet(wallet),
      getUnreadNotificationCount(wallet),
    ]);

    return NextResponse.json({ success: true, data: notifications, unread_count: unreadCount });
  } catch (error) {
    console.error('GET /api/notifications error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { wallet, ids } = body;

    if (!wallet) {
      return NextResponse.json({ success: false, error: 'wallet required' }, { status: 400 });
    }

    try {
      requireWalletAuth(body);
    } catch (err) {
      const msg = err instanceof WalletAuthError ? err.message : 'Authentication failed';
      return NextResponse.json({ success: false, error: msg }, { status: 401 });
    }

    await markNotificationsRead(wallet, ids);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/notifications error:', error);
    return NextResponse.json({ success: false, error: 'Failed to mark notifications read' }, { status: 500 });
  }
}
