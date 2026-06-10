export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { isParquetEarnConfigured, getEnabledMarkets, readEnabledPoolHealths } from '@/lib/parquet-earn';
import { fetchFeeAccruals24h, computeFeeAprPct } from '@/lib/parquet-indexer';
import { getEarnTreasuryPubkey } from '@/lib/parquet-earn-treasury';

const marketsRateLimit = rateLimit(120, 60 * 1000);
const CACHE_TTL_MS = 20_000;
const ZERO = BigInt(0);

let cache: { at: number; payload: unknown } | null = null;

// A pool is depositable unless it holds a "stranded" balance: USDC with zero LP
// supply blocks the first deposit (program err 6031) until swept to insurance.
function isDepositable(totalUsdc: bigint, lpSupply: bigint): boolean {
  return lpSupply > ZERO || totalUsdc === ZERO;
}

// Public: enabled markets WITH live per-pool stats (one batched read for all),
// so the grid shows every pool's TVL/stress/depositable at load -- not per click.
export async function GET(request: NextRequest) {
  const limited = marketsRateLimit(request);
  if (limited) return limited;

  if (!isParquetEarnConfigured()) {
    return NextResponse.json({ success: false, error: 'Parquet Earn is not configured' }, { status: 503 });
  }

  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return NextResponse.json({ success: true, data: cache.payload });
  }

  let treasuryWallet: string | null = null;
  try {
    treasuryWallet = getEarnTreasuryPubkey().toBase58();
  } catch {
    treasuryWallet = null;
  }

  const enabled = getEnabledMarkets();
  const markets: Array<Record<string, unknown>> = [];

  try {
    const [healths, feeAccruals] = await Promise.all([
      readEnabledPoolHealths(),
      fetchFeeAccruals24h(enabled),
    ]);
    for (const m of enabled) {
      const h = healths.get(m);
      if (!h) continue;
      const owed = h.reservedUsdc + h.queueTotalOwed;
      const available = h.totalUsdc > owed ? h.totalUsdc - owed : ZERO;
      markets.push({
        market: m,
        treasury_wallet: treasuryWallet,
        total_usdc_micro: h.totalUsdc.toString(),
        reserved_usdc_micro: h.reservedUsdc.toString(),
        queue_total_owed_micro: h.queueTotalOwed.toString(),
        available_usdc_micro: available.toString(),
        lp_supply: h.lpSupply.toString(),
        stressed: h.queueTotalOwed > ZERO,
        depositable: isDepositable(h.totalUsdc, h.lpSupply),
        fee_apr_pct: computeFeeAprPct(feeAccruals.get(m) ?? null, h.totalUsdc),
      });
    }
  } catch (err) {
    console.error('GET /api/earn/parquet/markets health read failed:', err);
    // fall through: return the enabled list without per-market stats
  }

  const payload = { treasury_wallet: treasuryWallet, enabled, markets };
  cache = { at: Date.now(), payload };
  return NextResponse.json({ success: true, data: payload });
}
