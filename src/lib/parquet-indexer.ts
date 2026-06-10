// Read-only client for Parquet's public indexer API (api.parquet.exchange).
// Used to enrich Earn pool stats with trailing-24h fee accrual so we can show a
// Fee APR. Everything here is fail-open: indexer downtime must never break the
// Earn endpoints, which serve on-chain data as the source of truth.

const INDEXER_TIMEOUT_MS = 4_000;
const CACHE_TTL_MS = 60_000;

// LPs keep 60% of trading fees; the other 40% is swept to stakers/treasury/
// referrals. Verified against live data: totalFeesSwept24h is exactly 40% of
// totalFeesAccrued24h, matching the documented split.
const LP_FEE_SHARE = 0.6;

function indexerBaseUrl(): string {
  return process.env.PARQUET_INDEXER_API || 'https://api.parquet.exchange';
}

// Earn market ids are "<ticker>-usdc"; the indexer keys markets by bare
// uppercase ticker (e.g. "coin-usdc" -> "COIN").
function toIndexerMarket(market: string): string {
  return market.replace(/-usdc$/i, '').toUpperCase();
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

// Total fees (micro USDC) accrued by a market in the trailing 24h, or null when
// the indexer is unreachable or has no data. Cached briefly per market.
export async function fetchFeeAccrued24h(market: string): Promise<bigint | null> {
  const cached = accrualCache.get(market);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.accrued;

  let accrued: bigint | null = null;
  try {
    const json = await fetchJson(`${indexerBaseUrl()}/fees?market=${encodeURIComponent(toIndexerMarket(market))}`) as FeesResponse | null;
    const raw = json?.totalFeesAccrued24h;
    if (typeof raw === 'string' && /^\d+$/.test(raw)) accrued = BigInt(raw);
  } catch {
    accrued = null;
  }
  accrualCache.set(market, { at: Date.now(), accrued });
  return accrued;
}

export async function fetchFeeAccruals24h(markets: string[]): Promise<Map<string, bigint | null>> {
  const entries = await Promise.all(
    markets.map(async (m) => [m, await fetchFeeAccrued24h(m)] as const),
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
