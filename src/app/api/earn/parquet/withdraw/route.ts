export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { AuthError } from '@/lib/atelier-auth';
import { isAgentOwnedByUser, getAtelierAgent } from '@/lib/atelier-db';
import {
  resolveEarnCaller,
  earnRateLimit,
  parseSharesArg,
  validateSolanaAddress,
} from '@/lib/earn-auth';
import { isAnyEarnConfigured, tryGetVenue, vaultKeyFor } from '@/lib/earn/registry';
import { withdrawForOwner, getOwnerEarnPosition } from '@/lib/parquet-earn-flows';
import type { EarnOwnerKind } from '@/lib/parquet-earn-db';

// Withdraw from an Earn venue by burning vault shares. Pass `shares` (integer
// string) or `all: true`, plus an optional `venue`/`market` (default parquet).
// USDC is sent to `destination_wallet`, or for agents falls back to their
// configured payout/owner wallet.
export async function POST(request: NextRequest) {
  try {
    if (!isAnyEarnConfigured()) {
      return NextResponse.json({ success: false, error: 'Earn is not configured' }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    // Withdrawals are never gated: the caller can only burn their own vault
    // shares, so anyone who deposited (incl. during an open window) can exit.
    const caller = await resolveEarnCaller(request, body);
    const limited = earnRateLimit(`earn:${caller.ownerId}`);
    if (limited) return limited;

    const venueId = typeof body.venue === 'string' && body.venue.trim() ? body.venue.trim() : 'parquet';
    const venue = tryGetVenue(venueId);
    if (!venue) {
      return NextResponse.json({ success: false, error: `unknown venue "${venueId}"` }, { status: 400 });
    }
    if (!venue.isConfigured()) {
      return NextResponse.json({ success: false, error: `venue "${venueId}" is not configured` }, { status: 503 });
    }
    const market = typeof body.market === 'string' && body.market.trim()
      ? body.market.trim()
      : venue.listMarkets()[0]?.market;
    if (!market || !venue.isMarketEnabled(market)) {
      return NextResponse.json(
        { success: false, error: `market "${market ?? ''}" is not enabled for venue "${venueId}"` },
        { status: 400 },
      );
    }
    const marketKey = vaultKeyFor(venueId, market);

    // A signed-in owner may withdraw on behalf of an agent they own by passing
    // agent_id; otherwise the caller withdraws their own position.
    let ownerKind: EarnOwnerKind = caller.ownerKind;
    let ownerId = caller.ownerId;
    let fallbackDestination = caller.agent ? (caller.agent.payout_wallet || caller.agent.owner_wallet || null) : null;

    const onBehalfAgentId = typeof body.agent_id === 'string' && body.agent_id.trim() ? body.agent_id.trim() : null;
    if (onBehalfAgentId) {
      if (caller.ownerKind !== 'user') {
        return NextResponse.json({ success: false, error: 'agent_id is only valid for a signed-in owner' }, { status: 400 });
      }
      if (!(await isAgentOwnedByUser(onBehalfAgentId, caller.ownerId))) {
        return NextResponse.json({ success: false, error: 'you do not own this agent' }, { status: 403 });
      }
      const agent = await getAtelierAgent(onBehalfAgentId);
      ownerKind = 'agent';
      ownerId = onBehalfAgentId;
      fallbackDestination = agent?.payout_wallet || agent?.owner_wallet || null;
    }

    const { position } = await getOwnerEarnPosition(marketKey, ownerKind, ownerId);
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
    } else {
      destination = fallbackDestination;
    }
    if (!destination) {
      return NextResponse.json(
        { success: false, error: 'destination_wallet required (no fallback payout wallet on file)' },
        { status: 400 },
      );
    }

    const slippageBps = typeof body.slippage_bps === 'number' ? body.slippage_bps : undefined;

    const result = await withdrawForOwner({
      market: marketKey,
      ownerKind,
      ownerId,
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
