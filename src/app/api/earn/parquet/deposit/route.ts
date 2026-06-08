export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { AuthError } from '@/lib/atelier-auth';
import { resolveEarnCaller, earnRateLimit, parseUsdToMicro, microToUsdString } from '@/lib/earn-auth';
import { isParquetEarnConfigured } from '@/lib/parquet-earn';
import { depositFromTransfer } from '@/lib/parquet-earn-flows';

// Deposit into the Parquet Earn pool. The caller must first send USDC to the
// Earn treasury and pass that transfer signature as `incoming_tx_hash` (the push
// model). The server verifies the transfer, deploys it into the pool, and mints
// the caller's vault shares.
export async function POST(request: NextRequest) {
  try {
    if (!isParquetEarnConfigured()) {
      return NextResponse.json({ success: false, error: 'Parquet Earn is not configured' }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const caller = await resolveEarnCaller(request, body);
    const limited = earnRateLimit(`earn:${caller.ownerId}`);
    if (limited) return limited;

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
      ownerKind: caller.ownerKind,
      ownerId: caller.ownerId,
      amountUsdc,
      incomingTxHash,
      slippageBps,
    });

    return NextResponse.json({
      success: true,
      data: {
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
