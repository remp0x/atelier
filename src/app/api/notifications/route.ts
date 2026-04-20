export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getNotificationsByWallet, getUnreadNotificationCount, markNotificationsRead, ensureProfileExists } from '@/lib/atelier-db';
import { WalletAuthError } from '@/lib/solana-auth';
import { authenticateUserRequest, readSigFieldsFromQuery } from '@/lib/session';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    let wallet: string;
    try {
      wallet = await authenticateUserRequest(request, readSigFieldsFromQuery(request));
    } catch (err) {
      const msg = err instanceof WalletAuthError ? err.message : 'Authentication failed';
      return NextResponse.json({ success: false, error: msg }, { status: 401 });
    }

    ensureProfileExists(wallet).catch(() => {});

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
    const { ids } = body;

    let wallet: string;
    try {
      wallet = await authenticateUserRequest(request, body);
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
