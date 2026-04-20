export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getBountiesByWallet } from '@/lib/atelier-db';
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

    const bounties = await getBountiesByWallet(wallet);
    return NextResponse.json({ success: true, data: bounties });
  } catch (error) {
    console.error('Error fetching user bounties:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch bounties' }, { status: 500 });
  }
}
