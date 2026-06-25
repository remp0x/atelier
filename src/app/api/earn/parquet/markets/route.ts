export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { isParquetEarnConfigured, getEnabledCategories, readEnabledPoolHealths, availableLiquidity } from '@/lib/parquet-earn';
import { isAnyEarnConfigured, getVenue, getEnabledVenueMarkets } from '@/lib/earn/registry';
import { fetchCategoryFeeAccruals24h, computeFeeAprPct } from '@/lib/parquet-indexer';
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

// One Earn product (a venue) for the hub: its strategy framing + a headline rate
// + TVL + its constituent markets.
interface ProductEntry {
  id: string;
  kind: string;
  label: string;
  risk: 'lower' | 'higher';
  apr_label: string;
  headline_apr_pct: number | null;
  total_tvl_micro: string;
  markets: Array<Record<string, unknown>>;
}

// Public: every enabled market WITH live stats, in two shapes:
//  - `markets`/`enabled`: the legacy flat Parquet list (kept for back-compat).
//  - `products`: the venue/product-grouped view that powers the multi-product hub
//    (parquet = Liquidity Provision, solend = Lending, ...), risk-ranked.
export async function GET(request: NextRequest) {
  const limited = marketsRateLimit(request);
  if (limited) return limited;

  if (!isAnyEarnConfigured()) {
    return NextResponse.json({ success: false, error: 'Earn is not configured' }, { status: 503 });
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

  // --- Parquet markets (rich, indexer-enriched) ---
  const enabled = isParquetEarnConfigured() ? getEnabledCategories() : [];
  const markets: Array<Record<string, unknown>> = [];
  if (enabled.length > 0) {
    try {
      const [healths, feeAccruals] = await Promise.all([
        readEnabledPoolHealths(),
        fetchCategoryFeeAccruals24h(enabled),
      ]);
      for (const m of enabled) {
        const h = healths.get(m);
        if (!h) continue;
        const available = availableLiquidity(h);
        markets.push({
          market: m,
          venue: 'parquet',
          key: m,
          treasury_wallet: treasuryWallet,
          total_usdc_micro: h.totalUsdc.toString(),
          escrowed_usdc_micro: h.escrowedUsdc.toString(),
          reserved_usdc_micro: h.reservedUsdc.toString(),
          queue_total_owed_micro: h.queueTotalOwed.toString(),
          available_usdc_micro: available.toString(),
          lp_supply: h.lpSupply.toString(),
          paused: h.isPaused,
          stressed: h.queueTotalOwed > ZERO,
          depositable: !h.isPaused && isDepositable(h.totalUsdc, h.lpSupply),
          fee_apr_pct: computeFeeAprPct(feeAccruals.get(m) ?? null, h.totalUsdc),
        });
      }
    } catch (err) {
      console.error('GET /api/earn/parquet/markets parquet health read failed:', err);
    }
  }

  const products: ProductEntry[] = [];

  // Parquet product
  if (enabled.length > 0) {
    const v = getVenue('parquet');
    const feeAprs = markets
      .map((m) => m.fee_apr_pct)
      .filter((x): x is number => typeof x === 'number' && x > 0);
    const tvl = markets.reduce((s, m) => s + BigInt(m.total_usdc_micro as string), ZERO);
    products.push({
      id: v.id,
      kind: v.product.kind,
      label: v.product.label,
      risk: v.product.risk,
      apr_label: v.product.aprLabel,
      headline_apr_pct: feeAprs.length ? Math.max(...feeAprs) : null,
      total_tvl_micro: tvl.toString(),
      markets,
    });
  }

  // Other venues (lending, ...): generic health, one product each.
  const otherVenueIds = Array.from(new Set(getEnabledVenueMarkets().map((m) => m.venue))).filter((id) => id !== 'parquet');
  for (const venueId of otherVenueIds) {
    const v = getVenue(venueId);
    const entries: Array<Record<string, unknown>> = [];
    let headlineApr: number | null = null;
    let tvl = ZERO;
    for (const vm of v.listMarkets()) {
      try {
        const h = await v.readHealth(vm.market);
        const apr = typeof h.aprBps === 'number' ? h.aprBps / 100 : null;
        if (apr !== null && (headlineApr === null || apr > headlineApr)) headlineApr = apr;
        const total = h.totalUsdc ?? h.availableUsdc;
        tvl += total;
        entries.push({
          venue: venueId,
          market: vm.market,
          key: vm.key,
          label: vm.label,
          treasury_wallet: treasuryWallet,
          total_usdc_micro: total.toString(),
          available_usdc_micro: h.availableUsdc.toString(),
          apr_pct: apr,
          paused: h.isPaused,
          depositable: !h.isPaused,
        });
      } catch (err) {
        console.error(`GET /api/earn/parquet/markets ${venueId}/${vm.market} health read failed:`, err);
      }
    }
    if (entries.length > 0) {
      products.push({
        id: v.id,
        kind: v.product.kind,
        label: v.product.label,
        risk: v.product.risk,
        apr_label: v.product.aprLabel,
        headline_apr_pct: headlineApr,
        total_tvl_micro: tvl.toString(),
        markets: entries,
      });
    }
  }

  // Risk ladder: lower-risk products first.
  products.sort((a, b) => (a.risk === 'lower' ? 0 : 1) - (b.risk === 'lower' ? 0 : 1));

  const payload = { treasury_wallet: treasuryWallet, enabled, markets, products };
  cache = { at: Date.now(), payload };
  return NextResponse.json({ success: true, data: payload });
}
