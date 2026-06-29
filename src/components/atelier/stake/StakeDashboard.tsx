'use client';

import { motion } from 'framer-motion';
import { STAKING_TIERS } from '@/lib/staking-config';
import { formatTokenAmount, formatUsdc, type StakingStatsData } from './types';

interface Props {
  stats: StakingStatsData;
}

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  index: number;
}

function MetricCard({ label, value, sub, index }: MetricCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06 }}
      className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] px-4 py-4 flex flex-col gap-1"
    >
      <span className="font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-neutral-600">
        {label}
      </span>
      <span className="font-mono text-[22px] font-semibold text-black dark:text-white tabular-nums leading-none">
        {value}
      </span>
      {sub && (
        <span className="font-mono text-[10px] text-gray-400 dark:text-neutral-600">{sub}</span>
      )}
    </motion.div>
  );
}

export function StakeDashboard({ stats }: Props) {
  const { atelierDecimals, usdcDecimals } = stats;

  const tvlAtelier = formatTokenAmount(BigInt(stats.tvlStaked), atelierDecimals, 2);
  const rewardsDistributed = formatUsdc(BigInt(stats.totalRewardsDistributed), 2);
  const rewardVaultBalance = formatUsdc(BigInt(stats.rewardVaultBalance), 2);

  const metrics: Omit<MetricCardProps, 'index'>[] = [
    { label: 'Total Staked', value: `${tvlAtelier} ATELIER` },
    { label: 'Stakers', value: stats.stakers.toLocaleString(), sub: `${stats.positions} positions` },
    { label: 'Rewards Distributed', value: `$${rewardsDistributed}`, sub: 'USDC lifetime' },
    { label: 'Reward Pool', value: `$${rewardVaultBalance}`, sub: 'USDC available' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {metrics.map((m, i) => (
          <MetricCard key={m.label} {...m} index={i} />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.28 }}
        className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-gray-100 dark:border-neutral-800/60">
          <span className="font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-neutral-600">
            Lock distribution
          </span>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-neutral-800/60">
          {STAKING_TIERS.map((tier, i) => {
            const tierStats = stats.tiers.find((t) => t.tier === tier.index);
            const stakedAmt = tierStats ? formatTokenAmount(BigInt(tierStats.staked), atelierDecimals, 2) : '0.00';
            const posCount = tierStats?.positions ?? 0;
            const totalStaked = BigInt(stats.tvlStaked);
            const tierStaked = BigInt(tierStats?.staked ?? '0');
            const pct =
              totalStaked > 0n
                ? Number((tierStaked * 10000n) / totalStaked) / 100
                : 0;

            return (
              <motion.div
                key={tier.index}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.32 + i * 0.05 }}
                className="flex items-center gap-4 px-4 py-3"
              >
                <div className="flex items-center gap-2 w-28 shrink-0">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-atelier/10 font-mono text-[10px] font-semibold text-atelier">
                    {tier.multiplierLabel}
                  </span>
                  <span className="font-mono text-[11px] text-black dark:text-white">{tier.label}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="h-1.5 rounded-full bg-gray-100 dark:bg-neutral-800 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, delay: 0.4 + i * 0.05, ease: 'easeOut' }}
                      className="h-full rounded-full bg-atelier"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-right">
                  <span className="font-mono text-[11px] text-gray-400 dark:text-neutral-500 tabular-nums">
                    {posCount} pos
                  </span>
                  <span className="font-mono text-[11px] text-black dark:text-white tabular-nums w-28">
                    {stakedAmt} ATELIER
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {stats.paused && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5"
        >
          <svg
            className="w-3.5 h-3.5 text-amber-500 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <span className="font-mono text-[11px] text-amber-500">
            Staking is currently paused. Existing positions can still claim rewards.
          </span>
        </motion.div>
      )}
    </div>
  );
}
