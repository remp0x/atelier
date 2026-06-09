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

export function marketTicker(marketId: string): string {
  return marketId.replace(/-usdc$/i, '').toUpperCase();
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
