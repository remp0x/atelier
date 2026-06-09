export interface PoolData {
  market: string;
  treasury_wallet: string;
  total_usdc_micro: string;
  reserved_usdc_micro: string;
  queue_total_owed_micro: string;
  available_usdc_micro: string;
  lp_supply: string;
  stressed: boolean;
}

export interface Position {
  vault_id: string;
  pool_market: string;
  shares: string;
  principal_usd: string;
  value_usd: string | null;
}

export type DepositStep = 'idle' | 'signing' | 'confirming' | 'submitting' | 'done';

export type WithdrawStep = 'idle' | 'submitting' | 'done';

export interface MarketDefinition {
  id: string;
  ticker: string;
  subtitle: string;
  enabled: boolean;
}

export const MARKETS: MarketDefinition[] = [
  { id: 'intc-usdc', ticker: 'INTC', subtitle: 'US Equity / ETF', enabled: true },
  { id: 'spy-usdc',  ticker: 'SPY',  subtitle: 'US Equity / ETF', enabled: false },
  { id: 'tsla-usdc', ticker: 'TSLA', subtitle: 'US Equity / ETF', enabled: false },
  { id: 'nvda-usdc', ticker: 'NVDA', subtitle: 'US Equity / ETF', enabled: false },
  { id: 'aapl-usdc', ticker: 'AAPL', subtitle: 'US Equity / ETF', enabled: false },
  { id: 'amzn-usdc', ticker: 'AMZN', subtitle: 'US Equity / ETF', enabled: false },
  { id: 'mstr-usdc', ticker: 'MSTR', subtitle: 'US Equity / ETF', enabled: false },
  { id: 'googl-usdc',ticker: 'GOOGL',subtitle: 'US Equity / ETF', enabled: false },
  { id: 'msft-usdc', ticker: 'MSFT', subtitle: 'US Equity / ETF', enabled: false },
  { id: 'meta-usdc', ticker: 'META', subtitle: 'US Equity / ETF', enabled: false },
  { id: 'coin-usdc', ticker: 'COIN', subtitle: 'US Equity / ETF', enabled: false },
  { id: 'hood-usdc', ticker: 'HOOD', subtitle: 'US Equity / ETF', enabled: false },
  { id: 'amd-usdc',  ticker: 'AMD',  subtitle: 'US Equity / ETF', enabled: false },
  { id: 'mu-usdc',   ticker: 'MU',   subtitle: 'US Equity / ETF', enabled: false },
  { id: 'crcl-usdc', ticker: 'CRCL', subtitle: 'US Equity / ETF', enabled: false },
  { id: 'gld-usdc',  ticker: 'GLD',  subtitle: 'Commodity / ETF', enabled: false },
  { id: 'qqq-usdc',  ticker: 'QQQ',  subtitle: 'US Equity / ETF', enabled: false },
  { id: 'pltr-usdc', ticker: 'PLTR', subtitle: 'US Equity / ETF', enabled: false },
  { id: 'sndk-usdc', ticker: 'SNDK', subtitle: 'US Equity / ETF', enabled: false },
];

export function microToUsd(micro: string): number {
  return Number(micro) / 1e6;
}

export function formatUsd(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function usdcMicroUnits(amountUsd: number): bigint {
  const USDC_DECIMALS = 6;
  const [whole, frac = ''] = amountUsd.toFixed(USDC_DECIMALS).split('.');
  const padded = (frac + '0'.repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS);
  return BigInt(whole) * BigInt(10 ** USDC_DECIMALS) + BigInt(padded);
}
