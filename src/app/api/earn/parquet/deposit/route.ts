export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { AuthError } from '@/lib/atelier-auth';
import { requirePrivyAdmin, AdminAuthError } from '@/lib/admin-auth';
import { resolveEarnCaller, earnRateLimit, parseUsdToMicro, microToUsdString } from '@/lib/earn-auth';
import { isAnyEarnConfigured, tryGetVenue, vaultKeyFor, parseVenueKey } from '@/lib/earn/registry';
import { isEarnDepositsOpen } from '@/lib/earn-access';
import { depositFromTransfer } from '@/lib/parquet-earn-flows';

// Deposit into an Earn venue. The caller first sends USDC to the Earn treasury
// and passes that transfer signature as `incoming_tx_hash` (push model), plus the
// `venue` (defaults to parquet) and `market` to deposit into (defaults to the
// venue's first market). The server verifies the transfer, deploys it into that
// venue, and mints shares.
export async function POST(request: NextRequest) {
  try {
    if (!isAnyEarnConfigured()) {
      return NextResponse.json({ success: false, error: 'Earn is not configured' }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    // Deposits are admin-only until explicitly opened (EARN_DEPOSITS_OPEN=true).
    // The page-visibility flag (EARN_PUBLIC) deliberately does NOT open deposits.
    if (!isEarnDepositsOpen()) await requirePrivyAdmin(request, body);
    const caller = await resolveEarnCaller(request, body);
    const limited = earnRateLimit(`earn:${caller.ownerId}`);
    if (limited) return limited;

    // A market is identified by its vault `key` (e.g. "solend:usdc"), or by an
    // explicit venue+market pair; both resolve to the same (venue, market).
    const parsedKey = typeof body.key === 'string' && body.key.trim() ? parseVenueKey(body.key.trim()) : null;
    const venueId = parsedKey
      ? parsedKey.venue
      : (typeof body.venue === 'string' && body.venue.trim() ? body.venue.trim() : 'parquet');
    const venue = tryGetVenue(venueId);
    if (!venue) {
      return NextResponse.json({ success: false, error: `unknown venue "${venueId}"` }, { status: 400 });
    }
    if (!venue.isConfigured()) {
      return NextResponse.json({ success: false, error: `venue "${venueId}" is not configured` }, { status: 503 });
    }
    const market = parsedKey
      ? parsedKey.market
      : (typeof body.market === 'string' && body.market.trim() ? body.market.trim() : venue.listMarkets()[0]?.market);
    if (!market || !venue.isMarketEnabled(market)) {
      return NextResponse.json(
        { success: false, error: `market "${market ?? ''}" is not enabled for venue "${venueId}"` },
        { status: 400 },
      );
    }
    const marketKey = vaultKeyFor(venueId, market);

    const amountUsdc = parseUsdToMicro(body.amount_usd);
    const incomingTxHash = typeof body.incoming_tx_hash === 'string' ? body.incoming_tx_hash.trim() : '';
    if (!incomingTxHash) {
      return NextResponse.json(
        { success: false, error: 'incoming_tx_hash required: send USDC to the Earn treasury and pass the transfer signature' },
        { status: 400 },
      );
    }
    const slippageBps = typeof body.slippage_bps === 'number' ? body.slippage_bps : undefined;

    const result = await depositFromTransfer({
      market: marketKey,
      ownerKind: caller.ownerKind,
      ownerId: caller.ownerId,
      amountUsdc,
      incomingTxHash,
      slippageBps,
    });

    return NextResponse.json({
      success: true,
      data: {
        venue: venueId,
        market,
        tx_hash: result.txHash,
        shares_minted: result.sharesMinted.toString(),
        lp_minted: result.lpMinted.toString(),
        position: {
          shares: result.position.shares.toString(),
          principal_usd: microToUsdString(result.position.principalUsdc),
        },
      },
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error('POST /api/earn/parquet/deposit error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
