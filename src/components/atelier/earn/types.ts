export interface PoolData {
  market: string;
  treasury_wallet: string;
  total_usdc_micro: string;
  reserved_usdc_micro: string;
  queue_total_owed_micro: string;
  available_usdc_micro: string;
  escrowed_usdc_micro?: string;
  lp_supply: string;
  stressed: boolean;
  paused?: boolean;
  depositable: boolean;
  fee_apr_pct?: number | null;
}

export interface ParquetMarketEntry extends PoolData {
  venue: 'parquet';
  key: string;
}

export interface SolendMarketEntry {
  venue: 'solend';
  market: string;
  key: string;
  label: string;
  treasury_wallet: string;
  total_usdc_micro: string;
  available_usdc_micro: string;
  apr_pct: number | null;
  paused: boolean;
  depositable: boolean;
}

export type MarketEntry = ParquetMarketEntry | SolendMarketEntry;

export interface ProductData {
  id: 'solend' | 'parquet';
  kind: 'lending' | 'liquidity_provision';
  label: string;
  risk: 'lower' | 'higher';
  apr_label: string;
  headline_apr_pct: number | null;
  total_tvl_micro: string;
  markets: MarketEntry[];
}

export interface Position {
  vault_id: string;
  pool_market: string;
  shares: string;
  principal_usd: string;
  value_usd: string | null;
  // Who holds this position: 'you' for the signed-in owner, or an agent's name.
  // agent_id is set when the position belongs to an agent the owner controls.
  owned_by: string;
  agent_id: string | null;
}

export type DepositStep = 'idle' | 'signing' | 'confirming' | 'submitting' | 'done';

export type WithdrawStep = 'idle' | 'submitting' | 'done';

export function marketTicker(marketId: string): string {
  return marketId.replace(/-usdc$/i, '').toUpperCase();
}

interface CategoryMeta {
  name: string;
  subtitle: string;
}

const CATEGORY_META: Record<string, CategoryMeta> = {
  'equity-us': { name: 'US Equities', subtitle: 'Tokenized US stocks & ETFs' },
  'crypto-usd': { name: 'Crypto', subtitle: 'BTC, ETH & SOL perps' },
};

export function categoryName(categoryId: string): string {
  return CATEGORY_META[categoryId]?.name ?? categoryId.toUpperCase();
}

export function categorySubtitle(categoryId: string): string {
  return CATEGORY_META[categoryId]?.subtitle ?? 'Liquidity pool';
}

// Tokenized US equities backing the equity-us pool. SPY is an ETF; the rest are stocks.
export const COMPANY_NAMES: Record<string, string> = {
  AAPL: 'Apple', AMD: 'AMD', ASML: 'ASML', AVGO: 'Broadcom', BABA: 'Alibaba',
  COIN: 'Coinbase', COST: 'Costco', CRCL: 'Circle', CRWV: 'CoreWeave', DELL: 'Dell',
  HOOD: 'Robinhood', IBM: 'IBM', INTC: 'Intel', LLY: 'Eli Lilly', META: 'Meta',
  MSFT: 'Microsoft', MU: 'Micron', NFLX: 'Netflix', ORCL: 'Oracle', PLTR: 'Palantir',
  RIVN: 'Rivian', SNDK: 'SanDisk', SPY: 'S&P 500 ETF', TSM: 'TSMC',
};

// Crypto perps backing the crypto-usd pool.
export const CRYPTO_NAMES: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana',
};

// Constituent markets a category pool earns fees across, for the grid "Earns fees
// across" basket. Empty for categories with no display roster.
const CATEGORY_CONSTITUENTS: Record<string, Record<string, string>> = {
  'equity-us': COMPANY_NAMES,
  'crypto-usd': CRYPTO_NAMES,
};

export function categoryConstituents(categoryId: string): Array<{ ticker: string; name: string }> {
  const map = CATEGORY_CONSTITUENTS[categoryId];
  if (!map) return [];
  return Object.entries(map).map(([ticker, name]) => ({ ticker, name }));
}

export function marketName(marketId: string): string {
  return COMPANY_NAMES[marketTicker(marketId)] ?? categoryName(marketId);
}

export function microToUsd(micro: string): number {
  return Number(micro) / 1e6;
}

export function formatUsd(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatAprPct(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return '—';
  if (pct > 0 && pct < 0.01) return '<0.01%';
  if (pct >= 1000) return `${Math.round(pct).toLocaleString('en-US')}%`;
  return `${pct.toFixed(2)}%`;
}

export function usdcMicroUnits(amountUsd: number): bigint {
  const USDC_DECIMALS = 6;
  const [whole, frac = ''] = amountUsd.toFixed(USDC_DECIMALS).split('.');
  const padded = (frac + '0'.repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS);
  return BigInt(whole) * BigInt(10 ** USDC_DECIMALS) + BigInt(padded);
}
