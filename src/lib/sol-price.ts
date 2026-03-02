let cachedPrice = 0;
let fetchedAt = 0;
const TTL_MS = 2 * 60 * 60 * 1000;

export async function getSolPriceUsd(): Promise<number> {
  if (cachedPrice > 0 && Date.now() - fetchedAt < TTL_MS) {
    return cachedPrice;
  }
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
      signal: AbortSignal.timeout(5000),
    });
    const json = await res.json();
    const price = json?.solana?.usd;
    if (typeof price === 'number' && price > 0) {
      cachedPrice = price;
      fetchedAt = Date.now();
      return price;
    }
  } catch { /* fall through */ }
  return cachedPrice || 0;
}
