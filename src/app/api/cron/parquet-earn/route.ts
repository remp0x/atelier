export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { isAnyEarnConfigured, getEnabledVenueMarkets } from '@/lib/earn/registry';
import { reconcileEarnVault, settleQueuedEarnWithdrawals } from '@/lib/parquet-earn-flows';

// Maintenance cron for Earn: across every enabled venue:market, reconciles the
// ledger against on-chain position units (alerting on drift) and settles queued
// withdrawals as liquidity reaches the treasury.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ success: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization') || '';
  const expected = `Bearer ${cronSecret}`;
  if (authHeader.length !== expected.length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!isAnyEarnConfigured()) {
    return NextResponse.json({ success: true, data: { skipped: 'not configured' } });
  }

  const results: Array<Record<string, unknown>> = [];
  for (const { key } of getEnabledVenueMarkets()) {
    try {
      const reconcile = await reconcileEarnVault(key);
      if (reconcile.drift !== BigInt(0)) {
        console.error(
          `[earn cron] LEDGER DRIFT (${key}): db=${reconcile.dbLpTokens} onchain=${reconcile.onchainLpTokens} drift=${reconcile.drift}`,
        );
      }
      const settlement = await settleQueuedEarnWithdrawals(key);
      results.push({
        market: key,
        drift: reconcile.drift.toString(),
        settled: settlement.settled,
        paid_micro_usdc: settlement.paidMicroUsdc.toString(),
        remaining_queued: settlement.remaining,
      });
    } catch (err) {
      console.error(`earn cron failed for ${key}:`, err);
      results.push({ market: key, error: err instanceof Error ? err.message : 'failed' });
    }
  }

  return NextResponse.json({ success: true, data: { markets: results } });
}
