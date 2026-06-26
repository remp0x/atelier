'use client';

import { useState, useCallback } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import type { SolendMarketEntry, Position } from './types';
import { formatUsd, formatAprPct, microToUsd, compactUsd } from './types';
import { PoolPanel } from './PoolPanel';
import type { PoolData } from './types';

const VENUE_LOGO: Record<string, string> = {
  solend: '/save.jpg',
  kamino: '/kamino.jpg',
  meteora: '/meteora.svg',
};

function PauseIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
    </svg>
  );
}

function solendMarketAsPoolData(market: SolendMarketEntry): PoolData {
  return {
    market: market.market,
    treasury_wallet: market.treasury_wallet,
    total_usdc_micro: market.total_usdc_micro,
    reserved_usdc_micro: '0',
    queue_total_owed_micro: '0',
    available_usdc_micro: market.available_usdc_micro,
    lp_supply: '1',
    stressed: false,
    paused: market.paused,
    depositable: market.depositable,
    fee_apr_pct: market.apr_pct,
  };
}

interface LendingMarketCardProps {
  market: SolendMarketEntry;
  positions: Position[];
  positionsLoading: boolean;
  solanaAddress: string | null;
  solanaBalance: number;
  baseBalance: number;
  balanceLoading: boolean;
  authenticated: boolean;
  canDeposit: boolean;
  login: () => void;
  onPoolRefresh: (market: string) => Promise<void>;
}

export function LendingMarketCard({
  market,
  positions,
  positionsLoading,
  solanaAddress,
  solanaBalance,
  baseBalance,
  balanceLoading,
  authenticated,
  canDeposit,
  login,
  onPoolRefresh,
}: LendingMarketCardProps) {
  const [panelOpen, setPanelOpen] = useState(false);

  const marketPositions = positions.filter((p) => p.pool_market === market.key && p.shares !== '0');
  const totalPositionValue = marketPositions.reduce((sum, p) => {
    return sum + (p.value_usd !== null ? parseFloat(p.value_usd) : parseFloat(p.principal_usd));
  }, 0);
  const totalPositionPrincipal = marketPositions.reduce((sum, p) => sum + parseFloat(p.principal_usd), 0);
  const hasPosition = marketPositions.length > 0;
  const pnl = hasPosition ? totalPositionValue - totalPositionPrincipal : null;
  const pnlPositive = pnl !== null && pnl >= 0;

  const totalSupplied = microToUsd(market.total_usdc_micro);
  const available = microToUsd(market.available_usdc_micro);
  const aprPositive = market.apr_pct !== null && market.apr_pct > 0;

  const venue = market.key.split(':')[0];
  const logoSrc = VENUE_LOGO[venue];

  const pool = solendMarketAsPoolData(market);

  const handleToggle = useCallback(() => {
    setPanelOpen((prev) => !prev);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    }
  }, [handleToggle]);

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] overflow-hidden">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            {logoSrc && (
              <div className="w-7 h-7 rounded-full overflow-hidden shrink-0">
                <Image
                  src={logoSrc}
                  alt={market.label}
                  width={28}
                  height={28}
                  style={{ width: 28, height: 28 }}
                  className="object-cover"
                />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-display font-bold text-[20px] text-black dark:text-white leading-tight tracking-[-0.02em]">
                  {market.label}
                </h3>
                {market.paused && (
                  <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-gray-100 dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 font-mono text-[9px] text-gray-500 dark:text-neutral-400 shrink-0">
                    <PauseIcon className="w-2.5 h-2.5" />
                    Paused
                  </span>
                )}
              </div>
              <p className="font-mono text-[11px] text-gray-500 dark:text-neutral-400">
                USDC money market
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end shrink-0">
            <p className={`font-mono text-[26px] font-semibold tabular-nums leading-none ${aprPositive ? 'text-emerald-500 dark:text-emerald-400' : 'text-gray-400 dark:text-neutral-500'}`}>
              {formatAprPct(market.apr_pct)}
            </p>
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-600 mt-0.5">
              Supply APY
            </p>
          </div>
        </div>

        {hasPosition && (
          <div className="mb-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-600 mb-0.5">
              Your position
            </p>
            <div className="flex items-baseline gap-2">
              <p className="font-mono text-[18px] font-semibold tabular-nums text-black dark:text-white">
                ${formatUsd(totalPositionValue)}
              </p>
              {pnl !== null && (
                <span className={`font-mono text-[11px] tabular-nums ${pnlPositive ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                  {pnlPositive ? '+' : '-'}${formatUsd(Math.abs(pnl))}
                </span>
              )}
            </div>
          </div>
        )}

        <p className="font-mono text-[11px] text-gray-400 dark:text-neutral-600 tabular-nums mb-4">
          Supplied {compactUsd(totalSupplied)} &middot; Available {compactUsd(available)}
        </p>

        {market.paused && (
          <div className="flex items-start gap-2 rounded-lg bg-gray-100 dark:bg-neutral-900/60 border border-gray-200 dark:border-neutral-800 px-3 py-2.5 mb-3">
            <PauseIcon className="w-3.5 h-3.5 text-gray-400 dark:text-neutral-500 shrink-0 mt-px" />
            <p className="font-mono text-[11px] text-gray-500 dark:text-neutral-400 leading-snug">
              Deposits are temporarily paused. Withdrawals are still allowed.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={handleToggle}
          onKeyDown={handleKeyDown}
          aria-expanded={panelOpen}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg font-mono text-[12px] font-medium border border-atelier/40 text-atelier hover:bg-atelier hover:text-white hover:border-atelier focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/60 transition-colors cursor-pointer"
        >
          {panelOpen ? 'Close' : (hasPosition ? 'Manage position' : 'Deposit / Withdraw')}
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-200 ${panelOpen ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {panelOpen && (
          <motion.div
            key="lending-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="border-t border-gray-200 dark:border-neutral-800/60 px-5 py-5">
              {positionsLoading && !hasPosition ? (
                <div className="flex justify-center py-8">
                  <div className="w-4 h-4 rounded-full border-2 border-atelier/30 border-t-atelier animate-spin" />
                </div>
              ) : (
                <PoolPanel
                  pool={pool}
                  market={market.market}
                  poolKey={market.key}
                  positions={marketPositions}
                  positionsLoading={positionsLoading}
                  solanaAddress={solanaAddress}
                  solanaBalance={solanaBalance}
                  baseBalance={baseBalance}
                  balanceLoading={balanceLoading}
                  authenticated={authenticated}
                  canDeposit={canDeposit && !market.paused}
                  login={login}
                  onPoolRefresh={onPoolRefresh}
                  embedded
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
