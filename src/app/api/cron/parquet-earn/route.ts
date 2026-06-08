export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { isParquetEarnConfigured } from '@/lib/parquet-earn';
import { reconcileEarnVault, settleQueuedEarnWithdrawals } from '@/lib/parquet-earn-flows';

// Maintenance cron for Parquet Earn: reconciles the ledger against on-chain LP
// holdings (alerting on drift) and settles queued withdrawals as liquidity
// reaches the treasury.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ success: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!isParquetEarnConfigured()) {
    return NextResponse.json({ success: true, data: { skipped: 'not configured' } });
  }

  try {
    const reconcile = await reconcileEarnVault();
    if (reconcile.drift !== BigInt(0)) {
      console.error(
        `[parquet-earn cron] LEDGER DRIFT: db=${reconcile.dbLpTokens} onchain=${reconcile.onchainLpTokens} drift=${reconcile.drift}`,
      );
    }

    const settlement = await settleQueuedEarnWithdrawals();

    return NextResponse.json({
      success: true,
      data: {
        reconcile: {
          db_lp_tokens: reconcile.dbLpTokens.toString(),
          onchain_lp_tokens: reconcile.onchainLpTokens.toString(),
          drift: reconcile.drift.toString(),
        },
        settlement: {
          settled: settlement.settled,
          paid_micro_usdc: settlement.paidMicroUsdc.toString(),
          remaining_queued: settlement.remaining,
        },
      },
    });
  } catch (err) {
    console.error('parquet-earn cron failed:', err);
    return NextResponse.json({ success: false, error: 'Cron failed' }, { status: 500 });
  }
}
