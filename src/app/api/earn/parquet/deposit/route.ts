export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { AuthError } from '@/lib/atelier-auth';
import { resolveEarnCaller, earnRateLimit, parseUsdToMicro, microToUsdString } from '@/lib/earn-auth';
import { isParquetEarnConfigured, isMarketEnabled, getDefaultMarket } from '@/lib/parquet-earn';
import { depositFromTransfer } from '@/lib/parquet-earn-flows';

// Deposit into a Parquet Earn pool. The caller first sends USDC to the Earn
// treasury and passes that transfer signature as `incoming_tx_hash` (push model),
// plus the `market` to deposit into (defaults to the configured market). The
// server verifies the transfer, deploys it into that pool, and mints shares.
export async function POST(request: NextRequest) {
  try {
    if (!isParquetEarnConfigured()) {
      return NextResponse.json({ success: false, error: 'Parquet Earn is not configured' }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const caller = await resolveEarnCaller(request, body);
    const limited = earnRateLimit(`earn:${caller.ownerId}`);
    if (limited) return limited;

    const market = typeof body.market === 'string' && body.market.trim() ? body.market.trim() : getDefaultMarket();
    if (!isMarketEnabled(market)) {
      return NextResponse.json({ success: false, error: `market "${market}" is not enabled for Earn` }, { status: 400 });
    }

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
      market,
      ownerKind: caller.ownerKind,
      ownerId: caller.ownerId,
      amountUsdc,
      incomingTxHash,
      slippageBps,
    });

    return NextResponse.json({
      success: true,
      data: {
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
