export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getBountiesByWallet, getBountiesByUser } from '@/lib/atelier-db';
import { WalletAuthError } from '@/lib/solana-auth';
import { authenticateUserRequest, readSigFieldsFromQuery } from '@/lib/session';
import { readPrivyAccessToken, verifyPrivyAccessToken } from '@/lib/privy-auth';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const privyToken = readPrivyAccessToken(request, null);
    if (privyToken) {
      try {
        const info = await verifyPrivyAccessToken(privyToken);
        const bounties = await getBountiesByUser(info.privyUserId);
        return NextResponse.json({ success: true, data: bounties });
      } catch {
        // fall through to wallet auth
      }
    }

    let wallet: string;
    try {
      wallet = await authenticateUserRequest(request, readSigFieldsFromQuery(request));
    } catch (err) {
      const msg = err instanceof WalletAuthError ? err.message : 'Authentication failed';
      return NextResponse.json({ success: false, error: msg }, { status: 401 });
    }

    const bounties = await getBountiesByWallet(wallet);
    return NextResponse.json({ success: true, data: bounties });
  } catch (error) {
    console.error('Error fetching user bounties:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch bounties' }, { status: 500 });
  }
}
