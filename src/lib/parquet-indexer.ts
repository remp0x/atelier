// Read-only client for Parquet's public indexer API (api.parquet.exchange).
// Used to enrich Earn pool stats with a trailing-24h fee-based APR. Parquet's
// liquidity is now a single category pool (e.g. "equity-us") backing many
// markets, but the indexer still keys fees per market ticker (it has no category
// endpoint), so a category's fee accrual is the SUM across its constituent
// markets. Everything here is fail-open: indexer downtime must never break the
// Earn endpoints, which serve on-chain data as the source of truth.

import { getCategoryTickers } from './parquet-earn';

const INDEXER_TIMEOUT_MS = 4_000;
const CACHE_TTL_MS = 60_000;

// LPs keep 60% of trading fees; the other 40% is swept to stakers/treasury/
// referrals. Assumption carried over from the per-market pools; the unified-pool
// split is unconfirmed, but APR here is a display-only estimate (fail-open).
const LP_FEE_SHARE = 0.6;

function indexerBaseUrl(): string {
  return process.env.PARQUET_INDEXER_API || 'https://api.parquet.exchange';
}

interface FeesResponse {
  totalFeesAccrued24h?: string;
}

const accrualCache = new Map<string, { at: number; accrued: bigint | null }>();

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INDEXER_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Trailing-24h fees (micro USDC) for a single market ticker (e.g. "AAPL"), or
// null when the indexer is unreachable or has no data. Cached briefly per ticker.
async function fetchTickerFeeAccrued24h(ticker: string): Promise<bigint | null> {
  const cached = accrualCache.get(ticker);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.accrued;

  let accrued: bigint | null = null;
  try {
    const json = await fetchJson(`${indexerBaseUrl()}/fees?market=${encodeURIComponent(ticker)}`) as FeesResponse | null;
    const raw = json?.totalFeesAccrued24h;
    if (typeof raw === 'string' && /^\d+$/.test(raw)) accrued = BigInt(raw);
  } catch {
    accrued = null;
  }
  accrualCache.set(ticker, { at: Date.now(), accrued });
  return accrued;
}

// Trailing-24h fees for a whole category: the sum across its constituent market
// tickers. Null only when EVERY ticker read failed (a partial outage still
// yields a best-effort number); a reachable-but-quiet indexer yields zero.
export async function fetchCategoryFeeAccrued24h(category: string): Promise<bigint | null> {
  const tickers = getCategoryTickers(category);
  if (tickers.length === 0) return null;
  const results = await Promise.all(tickers.map((t) => fetchTickerFeeAccrued24h(t)));
  const present = results.filter((r): r is bigint => r !== null);
  if (present.length === 0) return null;
  return present.reduce((sum, v) => sum + v, BigInt(0));
}

export async function fetchCategoryFeeAccruals24h(categories: string[]): Promise<Map<string, bigint | null>> {
  const entries = await Promise.all(
    categories.map(async (c) => [c, await fetchCategoryFeeAccrued24h(c)] as const),
  );
  return new Map(entries);
}

// Annualized LP fee yield as a percentage: the LP share of the trailing-24h
// fees, projected over a year, against current pool TVL. Null when there is no
// TVL to yield against or no fee data.
export function computeFeeAprPct(accrued24h: bigint | null, totalUsdc: bigint): number | null {
  if (accrued24h === null || totalUsdc <= BigInt(0)) return null;
  const lpFees24h = Number(accrued24h) * LP_FEE_SHARE;
  return (lpFees24h / Number(totalUsdc)) * 365 * 100;
}
