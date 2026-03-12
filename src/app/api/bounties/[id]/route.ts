export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getBountyById, getClaimsForBounty, cancelBounty, getClaimsCountForBounty } from '@/lib/atelier-db';
import { requireWalletAuth, WalletAuthError } from '@/lib/solana-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const bounty = await getBountyById(params.id);
    if (!bounty) {
      return NextResponse.json({ success: false, error: 'Bounty not found' }, { status: 404 });
    }

    const claimsCount = await getClaimsCountForBounty(bounty.id);
    const includeClaims = request.nextUrl.searchParams.get('include_claims') === '1';

    if (includeClaims) {
      const sp = request.nextUrl.searchParams;
      const authPayload = {
        wallet: sp.get('wallet') || '',
        wallet_sig: sp.get('wallet_sig') || '',
        wallet_sig_ts: Number(sp.get('wallet_sig_ts') || 0),
      };
      try {
        const verifiedWallet = requireWalletAuth(authPayload);
        if (verifiedWallet === bounty.poster_wallet) {
          const claims = await getClaimsForBounty(bounty.id);
          return NextResponse.json({
            success: true,
            data: { ...bounty, claims_count: claimsCount, claims },
          });
        }
      } catch {
        // Auth failed — fall through to return without claims
      }
    }

    return NextResponse.json({
      success: true,
      data: { ...bounty, claims_count: claimsCount },
    });
  } catch (error) {
    console.error('Error fetching bounty:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch bounty' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { status, client_wallet } = body;

    if (status !== 'cancelled') {
      return NextResponse.json({ success: false, error: 'Only cancellation is supported via PATCH' }, { status: 400 });
    }

    if (!client_wallet) {
      return NextResponse.json({ success: false, error: 'client_wallet required' }, { status: 400 });
    }

    let verifiedWallet: string;
    try {
      verifiedWallet = requireWalletAuth(body);
    } catch (err) {
      const msg = err instanceof WalletAuthError ? err.message : 'Authentication failed';
      return NextResponse.json({ success: false, error: msg }, { status: 401 });
    }

    const bounty = await getBountyById(params.id);
    if (!bounty) {
      return NextResponse.json({ success: false, error: 'Bounty not found' }, { status: 404 });
    }

    if (bounty.poster_wallet !== verifiedWallet) {
      return NextResponse.json({ success: false, error: 'Only the poster can cancel this bounty' }, { status: 403 });
    }

    if (bounty.status !== 'open') {
      return NextResponse.json({ success: false, error: 'Only open bounties can be cancelled' }, { status: 400 });
    }

    await cancelBounty(params.id);

    return NextResponse.json({ success: true, data: { id: params.id, status: 'cancelled' } });
  } catch (error) {
    console.error('Error cancelling bounty:', error);
    return NextResponse.json({ success: false, error: 'Failed to cancel bounty' }, { status: 500 });
  }
}
