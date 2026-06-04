export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getBountyById, getClaimsForBounty, cancelBounty, getClaimsCountForBounty, isWalletLinkedToUser } from '@/lib/atelier-db';
import { WalletAuthError } from '@/lib/solana-auth';
import { authenticateUserRequest, readSigFieldsFromQuery } from '@/lib/session';
import { tryResolvePrivyUserId } from '@/lib/privy-auth';
import { isPrivyAdmin } from '@/lib/admin-auth';

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

    const userId = await tryResolvePrivyUserId(request, null);
    let isPoster = false;
    if (userId) {
      isPoster = bounty.user_id === userId || (await isWalletLinkedToUser(userId, bounty.poster_wallet));
    } else {
      try {
        const verifiedWallet = await authenticateUserRequest(request, readSigFieldsFromQuery(request));
        isPoster = verifiedWallet === bounty.poster_wallet;
      } catch {
      }
    }

    if (!isPoster && (await isPrivyAdmin(request, null))) {
      isPoster = true;
    }

    const data = { ...bounty, claims_count: claimsCount, viewer_is_poster: isPoster };

    if (isPoster && includeClaims) {
      const claims = await getClaimsForBounty(bounty.id);
      return NextResponse.json({ success: true, data: { ...data, claims } });
    }

    return NextResponse.json({ success: true, data });
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

    const bounty = await getBountyById(params.id);
    if (!bounty) {
      return NextResponse.json({ success: false, error: 'Bounty not found' }, { status: 404 });
    }

    const userId = await tryResolvePrivyUserId(request, body);
    let isPoster = false;
    if (userId) {
      isPoster = bounty.user_id === userId || (await isWalletLinkedToUser(userId, bounty.poster_wallet));
    } else {
      if (!client_wallet) {
        return NextResponse.json({ success: false, error: 'client_wallet required' }, { status: 400 });
      }
      try {
        const verifiedWallet = await authenticateUserRequest(
          request,
          { wallet: client_wallet, wallet_sig: body.wallet_sig, wallet_sig_ts: body.wallet_sig_ts },
        );
        isPoster = bounty.poster_wallet === verifiedWallet;
      } catch (err) {
        const msg = err instanceof WalletAuthError ? err.message : 'Authentication failed';
        return NextResponse.json({ success: false, error: msg }, { status: 401 });
      }
    }

    if (!isPoster) {
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
