export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getBountiesByWallet } from '@/lib/atelier-db';
import { requireWalletAuth, WalletAuthError } from '@/lib/solana-auth';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const wallet = request.nextUrl.searchParams.get('wallet');
    const walletSig = request.nextUrl.searchParams.get('wallet_sig');
    const walletSigTs = request.nextUrl.searchParams.get('wallet_sig_ts');

    if (!wallet || !walletSig || !walletSigTs) {
      return NextResponse.json(
        { success: false, error: 'wallet, wallet_sig, and wallet_sig_ts query parameters required' },
        { status: 401 },
      );
    }

    try {
      requireWalletAuth({ wallet, wallet_sig: walletSig, wallet_sig_ts: Number(walletSigTs) });
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
