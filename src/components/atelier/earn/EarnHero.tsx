'use client';

import { motion } from 'framer-motion';
import type { Position } from './types';
import { formatUsd } from './types';

interface EarnHeroProps {
  positions: Position[];
  positionsLoading: boolean;
  authenticated: boolean;
}

export function EarnHero({ positions, positionsLoading, authenticated }: EarnHeroProps) {
  const totalDeposited = positions.reduce((sum, p) => sum + parseFloat(p.principal_usd), 0);
  const totalValue = positions.reduce((sum, p) => {
    return sum + (p.value_usd !== null ? parseFloat(p.value_usd) : parseFloat(p.principal_usd));
  }, 0);
  const totalEarned = totalValue - totalDeposited;
  const hasPositions = positions.length > 0;

  return (
    <div className="px-4 pt-8 pb-6 md:px-8 md:pt-10 border-b border-gray-200 dark:border-neutral-800/60">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-center gap-2 mb-3"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-atelier">Atelier Earn</span>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.06 }}
        className="font-display font-bold text-2xl md:text-3xl tracking-[-0.025em] text-black dark:text-white mb-3 leading-tight"
      >
        Put idle USDC to work
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.12 }}
        className="text-[14px] text-gray-500 dark:text-neutral-400 leading-relaxed max-w-xl mb-6"
      >
        Earn yield on USDC that would otherwise sit idle &mdash; for you or your agents. Choose a strategy by risk and return. Start with lending for steady income, or go further with liquidity provision for higher fees.
      </motion.p>

      {authenticated && (hasPositions || positionsLoading) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2 }}
          className="flex items-center gap-6 rounded-xl border border-gray-200 dark:border-neutral-800 bg-gray-50/50 dark:bg-black/30 px-5 py-4 max-w-sm"
        >
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-600 mb-0.5">
              Total deposited
            </p>
            {positionsLoading ? (
              <div className="h-5 w-20 rounded bg-gray-200 dark:bg-neutral-800 animate-pulse" />
            ) : (
              <p className="font-mono text-[17px] font-semibold tabular-nums text-black dark:text-white">
                ${formatUsd(totalDeposited)}
              </p>
            )}
          </div>
          <div className="w-px h-8 bg-gray-200 dark:bg-neutral-800 shrink-0" />
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-600 mb-0.5">
              Total earnings
            </p>
            {positionsLoading ? (
              <div className="h-5 w-16 rounded bg-gray-200 dark:bg-neutral-800 animate-pulse" />
            ) : (
              <p className={`font-mono text-[17px] font-semibold tabular-nums ${totalEarned >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                {totalEarned >= 0 ? '+' : ''}{formatUsd(totalEarned)}
              </p>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
