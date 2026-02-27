import { NextRequest, NextResponse } from 'next/server';

interface CacheEntry {
  data: MarketData | null;
  expiresAt: number;
}

export interface MarketData {
  market_cap_usd: number;
  price_usd: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

setInterval(() => {
  const now = Date.now();
  Array.from(cache.entries()).forEach(([key, entry]) => {
    if (now > entry.expiresAt) cache.delete(key);
  });
}, 60 * 1000);

const PUMP_TOKEN_SUPPLY = 1_000_000_000;

async function fetchFromDexScreener(mint: string): Promise<MarketData | null> {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const pairs = json.pairs;
  if (!Array.isArray(pairs) || pairs.length === 0) return null;
  const pair = pairs[0];
  const mcap = pair.marketCap ?? pair.fdv ?? 0;
  const price = parseFloat(pair.priceUsd) || 0;
  if (mcap === 0 && price === 0) return null;
  return { market_cap_usd: mcap, price_usd: price };
}

async function fetchFromPumpFun(mint: string): Promise<MarketData | null> {
  const res = await fetch(`https://frontend-api-v3.pump.fun/coins/${mint}?sync=false`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const mcap = typeof json.usd_market_cap === 'number' ? json.usd_market_cap : 0;
  if (mcap === 0) return null;
  return { market_cap_usd: mcap, price_usd: mcap / PUMP_TOKEN_SUPPLY };
}

async function fetchMintData(mint: string): Promise<MarketData | null> {
  const cached = cache.get(mint);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  let data: MarketData | null = null;
  try {
    data = await fetchFromDexScreener(mint);
  } catch {
    // DexScreener failed, try fallback
  }

  if (!data) {
    try {
      data = await fetchFromPumpFun(mint);
    } catch {
      // PumpFun also failed
    }
  }

  cache.set(mint, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const mints: string[] = body.mints;

    if (!Array.isArray(mints) || mints.length === 0) {
      return NextResponse.json({ success: false, error: 'mints array required' }, { status: 400 });
    }

    const uniqueMints = Array.from(new Set(mints)).slice(0, 100);

    const results = await Promise.allSettled(
      uniqueMints.map(async (mint) => ({ mint, data: await fetchMintData(mint) }))
    );

    const marketData: Record<string, MarketData | null> = {};
    for (const result of results) {
      if (result.status === 'fulfilled') {
        marketData[result.value.mint] = result.value.data;
      }
    }

    return NextResponse.json({ success: true, data: marketData });
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
  }
}
