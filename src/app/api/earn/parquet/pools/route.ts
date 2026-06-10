export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { isParquetEarnConfigured, isMarketEnabled, getDefaultMarket, getParquetEarnConfig, readPoolHealth } from '@/lib/parquet-earn';
import { fetchFeeAccrued24h, computeFeeAprPct } from '@/lib/parquet-indexer';
import { getEarnTreasuryPubkey } from '@/lib/parquet-earn-treasury';

const poolsRateLimit = rateLimit(60, 60 * 1000);

// Public read of an Earn pool (?market=, defaults to the configured market):
// depth, the FIFO-queue obligation (stress signal), and available liquidity.
export async function GET(request: NextRequest) {
  const limited = poolsRateLimit(request);
  if (limited) return limited;

  if (!isParquetEarnConfigured()) {
    return NextResponse.json({ success: false, error: 'Parquet Earn is not configured' }, { status: 503 });
  }

  const marketParam = new URL(request.url).searchParams.get('market');
  if (marketParam && !isMarketEnabled(marketParam)) {
    return NextResponse.json({ success: false, error: `market "${marketParam}" is not enabled for Earn` }, { status: 400 });
  }
  const market = marketParam || getDefaultMarket();

  try {
    const cfg = getParquetEarnConfig(market);
    const [health, feeAccrued] = await Promise.all([readPoolHealth(market), fetchFeeAccrued24h(market)]);
    const owed = health.reservedUsdc + health.queueTotalOwed;
    const available = health.totalUsdc > owed ? health.totalUsdc - owed : BigInt(0);

    // The address depositors push USDC to before calling /deposit. Best-effort:
    // null if the treasury key is not provisioned yet.
    let treasuryWallet: string | null = null;
    try {
      treasuryWallet = getEarnTreasuryPubkey().toBase58();
    } catch {
      treasuryWallet = null;
    }

    return NextResponse.json({
      success: true,
      data: {
        market: cfg.marketLabel,
        treasury_wallet: treasuryWallet,
        total_usdc_micro: health.totalUsdc.toString(),
        reserved_usdc_micro: health.reservedUsdc.toString(),
        queue_total_owed_micro: health.queueTotalOwed.toString(),
        available_usdc_micro: available.toString(),
        lp_supply: health.lpSupply.toString(),
        stressed: health.queueTotalOwed > BigInt(0),
        depositable: health.lpSupply > BigInt(0) || health.totalUsdc === BigInt(0),
        fee_apr_pct: computeFeeAprPct(feeAccrued, health.totalUsdc),
      },
    });
  } catch (error) {
    console.error('GET /api/earn/parquet/pools error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
