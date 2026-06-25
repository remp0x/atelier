'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  categoryName,
  categorySubtitle,
  categoryConstituents,
  type PoolData,
  type ParquetMarketEntry,
  type Position,
  formatUsd,
  formatAprPct,
  microToUsd,
} from './types';
import { PoolPanel } from './PoolPanel';

const INIT_TOOLTIP =
  'Initializing - this pool holds USDC with no LP yet, so deposits are paused until Parquet seeds it.';

function ClockIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function WarningTriangleIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
    </svg>
  );
}

function PauseIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
    </svg>
  );
}

function TickerBasket({ items }: { items: Array<{ ticker: string; name: string }> }) {
  return (
    <div className="overflow-hidden relative" aria-label="Constituent markets">
      <div className="flex flex-wrap gap-1.5 max-h-[4.5rem] overflow-hidden">
        {items.map(({ ticker, name }) => (
          <span
            key={ticker}
            title={name}
            className="inline-flex items-center h-5 px-1.5 rounded font-mono text-[9px] text-gray-500 dark:text-neutral-400 bg-gray-100 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 select-none whitespace-nowrap"
          >
            {ticker}
          </span>
        ))}
      </div>
    </div>
  );
}

export interface MarketGridProps {
  markets: ParquetMarketEntry[];
  poolsByMarket: Record<string, PoolData>;
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
  onFetchPool: (marketId: string) => Promise<void>;
}

interface CategoryPoolCardProps {
  categoryId: string;
  poolKey: string;
  pool: PoolData | null;
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
  onFetchPool: (marketId: string) => Promise<void>;
}

function CategoryPoolCard({
  categoryId,
  poolKey,
  pool,
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
  onFetchPool,
}: CategoryPoolCardProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const constituents = categoryConstituents(categoryId);

  const categoryPositions = positions.filter((p) => p.pool_market === categoryId);
  const totalPositionValue = categoryPositions.reduce((sum, p) => {
    return sum + (p.value_usd !== null ? parseFloat(p.value_usd) : parseFloat(p.principal_usd));
  }, 0);
  const totalPositionPrincipal = categoryPositions.reduce((sum, p) => sum + parseFloat(p.principal_usd), 0);
  const hasPosition = categoryPositions.length > 0;

  const tvl = pool ? microToUsd(pool.total_usdc_micro) : null;
  const available = pool ? microToUsd(pool.available_usdc_micro) : null;
  const paused = pool?.paused ?? false;
  const stressed = pool?.stressed ?? false;
  const initializing = pool !== null && !pool.depositable;

  const pnl = hasPosition ? totalPositionValue - totalPositionPrincipal : null;
  const pnlPositive = pnl !== null && pnl >= 0;

  const handleToggle = useCallback(() => {
    setPanelOpen((prev) => {
      if (!prev) void onFetchPool(categoryId);
      return !prev;
    });
  }, [categoryId, onFetchPool]);

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
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-display font-bold text-[20px] text-black dark:text-white leading-tight tracking-[-0.02em]">
                {categoryName(categoryId)}
              </h3>
              {paused && (
                <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-gray-100 dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 font-mono text-[9px] text-gray-500 dark:text-neutral-400 shrink-0">
                  <PauseIcon className="w-2.5 h-2.5" />
                  Paused
                </span>
              )}
              {!paused && stressed && (
                <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-amber-500/10 border border-amber-500/30 font-mono text-[9px] text-amber-500 shrink-0">
                  <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                  Stress
                </span>
              )}
              {!paused && initializing && (
                <span
                  className="inline-flex items-center gap-1 h-5 px-2 rounded-full border border-gray-200 dark:border-neutral-800 font-mono text-[9px] text-gray-400 dark:text-neutral-500 shrink-0 cursor-help"
                  title={INIT_TOOLTIP}
                >
                  <ClockIcon className="w-2.5 h-2.5" />
                  Initializing
                </span>
              )}
            </div>
            <p className="font-mono text-[11px] text-gray-500 dark:text-neutral-400">
              {categorySubtitle(categoryId)}
            </p>
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            {pool ? (
              <>
                <p className={`font-mono text-[11px] tabular-nums ${typeof pool.fee_apr_pct === 'number' && pool.fee_apr_pct > 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-gray-400 dark:text-neutral-500'}`}>
                  {formatAprPct(pool.fee_apr_pct)}
                  <span className="text-[9px] ml-1 text-gray-400 dark:text-neutral-600">Fee APR</span>
                </p>
              </>
            ) : (
              <div className="h-4 w-20 rounded bg-gray-100 dark:bg-neutral-800 animate-pulse" />
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-600 mb-0.5">TVL</p>
            {tvl !== null ? (
              <p className="font-mono text-[17px] font-semibold tabular-nums text-black dark:text-white">${formatUsd(tvl)}</p>
            ) : (
              <div className="h-5 w-24 rounded bg-gray-100 dark:bg-neutral-800 animate-pulse" />
            )}
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-600 mb-0.5">Available</p>
            {available !== null ? (
              <p className={`font-mono text-[17px] font-semibold tabular-nums ${stressed ? 'text-amber-500' : 'text-black dark:text-white'}`}>
                ${formatUsd(available)}
              </p>
            ) : (
              <div className="h-5 w-24 rounded bg-gray-100 dark:bg-neutral-800 animate-pulse" />
            )}
          </div>
          {hasPosition && (
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-600 mb-0.5">Your position</p>
              <div className="flex items-baseline gap-1.5">
                <p className="font-mono text-[17px] font-semibold tabular-nums text-black dark:text-white">${formatUsd(totalPositionValue)}</p>
                {pnl !== null && (
                  <span className={`font-mono text-[11px] tabular-nums ${pnlPositive ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                    {pnlPositive ? '+' : ''}{formatUsd(pnl)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {constituents.length > 0 && (
          <div className="mb-4">
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-600 mb-1.5">
              Earns fees across
            </p>
            <TickerBasket items={constituents} />
          </div>
        )}

        {paused && (
          <div className="flex items-start gap-2 rounded-lg bg-gray-100 dark:bg-neutral-900/60 border border-gray-200 dark:border-neutral-800 px-3 py-2.5 mb-3">
            <PauseIcon className="w-3.5 h-3.5 text-gray-400 dark:text-neutral-500 shrink-0 mt-px" />
            <p className="font-mono text-[11px] text-gray-500 dark:text-neutral-400 leading-snug">
              Deposits are temporarily paused by Parquet. Withdrawals are still allowed.
            </p>
          </div>
        )}

        {!paused && stressed && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 mb-3">
            <WarningTriangleIcon className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-px" />
            <p className="font-mono text-[11px] text-amber-500 leading-snug">
              Pool is under stress. Withdrawals may be queued. New deposits carry elevated risk.
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
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {panelOpen && (
          <motion.div
            key="pool-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="border-t border-gray-200 dark:border-neutral-800/60 px-5 py-5">
              {pool ? (
                <PoolPanel
                  pool={pool}
                  market={categoryId}
                  poolKey={poolKey}
                  positions={categoryPositions}
                  positionsLoading={positionsLoading}
                  solanaAddress={solanaAddress}
                  solanaBalance={solanaBalance}
                  baseBalance={baseBalance}
                  balanceLoading={balanceLoading}
                  authenticated={authenticated}
                  canDeposit={canDeposit && !paused}
                  login={login}
                  onPoolRefresh={onPoolRefresh}
                  embedded
                />
              ) : (
                <div className="flex justify-center py-8">
                  <div className="w-4 h-4 rounded-full border-2 border-atelier/30 border-t-atelier animate-spin" />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MarketGrid({
  markets,
  poolsByMarket,
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
  onFetchPool,
}: MarketGridProps) {
  useEffect(() => {
    if (markets.length === 1) {
      void onFetchPool(markets[0].market);
    }
  }, [markets, onFetchPool]);

  if (markets.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="font-mono text-[11px] text-gray-400 dark:text-neutral-600">No markets available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {markets.map((entry, i) => {
        const pool = poolsByMarket[entry.market] ?? null;
        return (
          <motion.div
            key={entry.market}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
          >
            <CategoryPoolCard
              categoryId={entry.market}
              poolKey={entry.key}
              pool={pool}
              positions={positions}
              positionsLoading={positionsLoading}
              solanaAddress={solanaAddress}
              solanaBalance={solanaBalance}
              baseBalance={baseBalance}
              balanceLoading={balanceLoading}
              authenticated={authenticated}
              canDeposit={canDeposit}
              login={login}
              onPoolRefresh={onPoolRefresh}
              onFetchPool={onFetchPool}
            />
          </motion.div>
        );
      })}
    </div>
  );
}
