export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { AuthError } from '@/lib/atelier-auth';
import {
  resolveEarnCaller,
  earnRateLimit,
  parseSharesArg,
  validateSolanaAddress,
} from '@/lib/earn-auth';
import { isParquetEarnConfigured, isMarketEnabled, getDefaultMarket } from '@/lib/parquet-earn';
import { withdrawForOwner, getOwnerEarnPosition } from '@/lib/parquet-earn-flows';

// Withdraw from the Parquet Earn pool by burning vault shares. Pass `shares`
// (integer string) or `all: true`. USDC is sent to `destination_wallet`, or for
// agents falls back to their configured payout/owner wallet.
export async function POST(request: NextRequest) {
  try {
    if (!isParquetEarnConfigured()) {
      return NextResponse.json({ success: false, error: 'Parquet Earn is not configured' }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    // Withdrawals are never gated: the caller can only burn their own vault
    // shares, so anyone who deposited (incl. during an open window) can exit.
    const caller = await resolveEarnCaller(request, body);
    const limited = earnRateLimit(`earn:${caller.ownerId}`);
    if (limited) return limited;

    const market = typeof body.market === 'string' && body.market.trim() ? body.market.trim() : getDefaultMarket();
    if (!isMarketEnabled(market)) {
      return NextResponse.json({ success: false, error: `market "${market}" is not enabled for Earn` }, { status: 400 });
    }

    const { position } = await getOwnerEarnPosition(market, caller.ownerKind, caller.ownerId);
    if (!position || position.shares <= BigInt(0)) {
      return NextResponse.json({ success: false, error: 'No active Earn position' }, { status: 400 });
    }

    const shares = body.all === true ? position.shares : parseSharesArg(body.shares);
    if (shares > position.shares) {
      return NextResponse.json(
        { success: false, error: `shares exceed position balance (have ${position.shares.toString()})` },
        { status: 400 },
      );
    }

    let destination: string | null = null;
    if (body.destination_wallet !== undefined && body.destination_wallet !== null) {
      destination = validateSolanaAddress(body.destination_wallet, 'destination_wallet');
    } else if (caller.agent) {
      destination = caller.agent.payout_wallet || caller.agent.owner_wallet || null;
    }
    if (!destination) {
      return NextResponse.json(
        { success: false, error: 'destination_wallet required (no fallback payout wallet on file)' },
        { status: 400 },
      );
    }

    const slippageBps = typeof body.slippage_bps === 'number' ? body.slippage_bps : undefined;

    const result = await withdrawForOwner({
      market,
      ownerKind: caller.ownerKind,
      ownerId: caller.ownerId,
      shares,
      destinationWallet: destination,
      slippageBps,
    });

    if (result.status === 'settled') {
      return NextResponse.json({
        success: true,
        data: {
          status: 'settled',
          shares_burned: shares.toString(),
          received_micro_usdc: result.received.toString(),
          tx_hash: result.txHash,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        status: 'queued',
        shares_burned: shares.toString(),
        queue_entry: result.queueEntry,
        note: 'Pool liquidity is short; the withdrawal is queued and settles as liquidity arrives.',
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error('POST /api/earn/parquet/withdraw error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
