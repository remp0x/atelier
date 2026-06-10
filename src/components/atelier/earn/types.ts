export interface PoolData {
  market: string;
  treasury_wallet: string;
  total_usdc_micro: string;
  reserved_usdc_micro: string;
  queue_total_owed_micro: string;
  available_usdc_micro: string;
  lp_supply: string;
  stressed: boolean;
  // Deposits are blocked by the program (err 6031) when a pool holds USDC with 0
  // LP supply (stranded). depositable = lp_supply > 0 OR total_usdc == 0.
  depositable: boolean;
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

// Tokenized US equities backing each pool. SPY is an ETF; the rest are stocks.
const COMPANY_NAMES: Record<string, string> = {
  AAPL: 'Apple', AMD: 'AMD', ASML: 'ASML', AVGO: 'Broadcom', BABA: 'Alibaba',
  COIN: 'Coinbase', COST: 'Costco', CRCL: 'Circle', CRWV: 'CoreWeave', DELL: 'Dell',
  HOOD: 'Robinhood', IBM: 'IBM', INTC: 'Intel', LLY: 'Eli Lilly', META: 'Meta',
  MSFT: 'Microsoft', MU: 'Micron', NFLX: 'Netflix', ORCL: 'Oracle', PLTR: 'Palantir',
  RIVN: 'Rivian', SNDK: 'SanDisk', SPY: 'S&P 500 ETF', TSM: 'TSMC',
};

export function marketName(marketId: string): string {
  return COMPANY_NAMES[marketTicker(marketId)] ?? 'US equity';
}

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
