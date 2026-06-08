export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { isParquetEarnConfigured, getParquetEarnConfig, readPoolHealth } from '@/lib/parquet-earn';
import { getEarnTreasuryPubkey } from '@/lib/parquet-earn-treasury';

const poolsRateLimit = rateLimit(60, 60 * 1000);

// Public read of the configured Earn pool: depth, the FIFO-queue obligation
// (the stress/drawdown signal), and available liquidity for instant withdrawal.
export async function GET(request: NextRequest) {
  const limited = poolsRateLimit(request);
  if (limited) return limited;

  if (!isParquetEarnConfigured()) {
    return NextResponse.json({ success: false, error: 'Parquet Earn is not configured' }, { status: 503 });
  }

  try {
    const cfg = getParquetEarnConfig();
    const health = await readPoolHealth();
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
