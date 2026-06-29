export interface StakingStatsData {
  initialized: boolean;
  atelierDecimals: number;
  usdcDecimals: number;
  tvlStaked: string;
  weightedTvl: string;
  stakers: number;
  positions: number;
  totalRewardsDistributed: string;
  totalRewardsClaimed: string;
  rewardVaultBalance: string;
  paused: boolean;
  tiers: {
    tier: number;
    label: string;
    multiplierLabel: string;
    positions: number;
    staked: string;
  }[];
}

export function formatTokenAmount(
  amount: bigint,
  decimals: number,
  displayDecimals = 2,
): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const frac = amount % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, displayDecimals);
  return `${whole.toLocaleString()}.${fracStr}`;
}

export function formatUsdc(amount: bigint, displayDecimals = 4): string {
  return formatTokenAmount(amount, 6, displayDecimals);
}

export function parseTokenInput(str: string, decimals: number): bigint {
  const clean = str.trim();
  if (!clean || clean === '.') return 0n;
  const [intPart, fracPart = ''] = clean.split('.');
  const fracPadded = fracPart.padEnd(decimals, '0').slice(0, decimals);
  const intVal = BigInt(intPart || '0') * 10n ** BigInt(decimals);
  const fracVal = BigInt(fracPadded || '0');
  return intVal + fracVal;
}

export function formatLockCountdown(lockUntilSecs: bigint): string {
  const nowSecs = BigInt(Math.floor(Date.now() / 1000));
  if (lockUntilSecs <= nowSecs) return 'Unlocked';
  const remaining = Number(lockUntilSecs - nowSecs);
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function isUnlocked(lockUntilSecs: bigint): boolean {
  if (lockUntilSecs === 0n) return true;
  return lockUntilSecs <= BigInt(Math.floor(Date.now() / 1000));
}
