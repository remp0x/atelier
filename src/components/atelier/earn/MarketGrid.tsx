'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { marketTicker, type PoolData, type Position, formatUsd, microToUsd } from './types';
import { PoolPanel } from './PoolPanel';

type GridLayout = 'grid' | 'list';
type SortBy = 'tvl' | 'alpha';

interface PoolPanelPassthrough {
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

interface PositionPreviewProps {
  positionValue: number;
  positionPrincipal: number;
  hasPosition: boolean;
  tvl: number | null;
}

function PositionPreview({ positionValue, positionPrincipal, hasPosition, tvl }: PositionPreviewProps) {
  if (hasPosition) {
    const pnl = positionValue - positionPrincipal;
    const pnlPositive = pnl >= 0;
    return (
      <div className="mt-auto pt-2">
        <p className="font-mono text-[8px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-600 mb-0.5">Your position</p>
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-[13px] font-medium text-black dark:text-white tabular-nums">${formatUsd(positionValue)}</span>
          <span className={`font-mono text-[10px] tabular-nums ${pnlPositive ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
            {pnlPositive ? '+' : ''}{formatUsd(pnl)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-auto pt-2">
      <p className="font-mono text-[8px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-600 mb-0.5">TVL</p>
      {tvl !== null ? (
        <p className="font-mono text-[13px] text-black dark:text-white tabular-nums">${formatUsd(tvl)}</p>
      ) : (
        <div className="h-4 w-16 rounded bg-gray-100 dark:bg-neutral-800 animate-pulse" />
      )}
    </div>
  );
}

interface MarketCardProps {
  marketId: string;
  ticker: string;
  pool: PoolData | null;
  expanded: boolean;
  positionValue: number | null;
  positionPrincipal: number | null;
  layout: GridLayout;
  panelPassthrough: PoolPanelPassthrough;
  onToggle: (id: string) => void;
}

function MarketCard({ marketId, ticker, pool, expanded, positionValue, positionPrincipal, layout, panelPassthrough, onToggle }: MarketCardProps) {
  const hasPosition = positionValue !== null;
  const tvl = pool ? microToUsd(pool.total_usdc_micro) : null;
  const stressed = pool?.stressed ?? false;

  const { poolsByMarket, positions, positionsLoading, solanaAddress, solanaBalance, baseBalance, balanceLoading, authenticated, canDeposit, login, onPoolRefresh } = panelPassthrough;
  const marketPool = poolsByMarket[marketId] ?? null;
  const initializing = pool !== null && !pool.depositable;

  const marketPositions = positions.filter((p) => p.pool_market === marketId);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle(marketId);
    }
  }, [marketId, onToggle]);

  if (layout === 'list') {
    return (
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => onToggle(marketId)}
          onKeyDown={handleKeyDown}
          aria-expanded={expanded}
          className={`flex items-center justify-between gap-3 w-full px-4 py-2.5 rounded-lg border text-left transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/60 min-h-[44px] ${
            expanded
              ? 'border-atelier/50 bg-atelier/5 dark:bg-atelier/5 rounded-b-none'
              : 'border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] hover:border-atelier/30 hover:bg-atelier/[0.02]'
          }`}
        >
          <div className="flex items-center gap-3">
            <p className="font-mono font-semibold text-[13px] text-black dark:text-white w-14">{ticker}</p>
            <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-500">US Equity</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {initializing && (
              <span className="inline-flex h-4 px-1.5 rounded-full bg-gray-100 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 font-mono text-[9px] text-gray-500 dark:text-neutral-400 items-center">
                initializing
              </span>
            )}
            {stressed && (
              <span className="inline-flex h-4 px-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 font-mono text-[9px] text-amber-500 items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                Stress
              </span>
            )}
            {hasPosition ? (
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[11px] tabular-nums text-black dark:text-white">${formatUsd(positionValue!)}</span>
                {positionPrincipal !== null && (() => {
                  const pnl = positionValue! - positionPrincipal;
                  const pos = pnl >= 0;
                  return (
                    <span className={`font-mono text-[10px] tabular-nums ${pos ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                      {pos ? '+' : ''}{formatUsd(pnl)}
                    </span>
                  );
                })()}
              </div>
            ) : tvl !== null ? (
              <span className="font-mono text-[11px] tabular-nums text-black dark:text-white">${formatUsd(tvl)}</span>
            ) : (
              <span className="h-3 w-10 rounded bg-gray-100 dark:bg-neutral-800 animate-pulse inline-block" />
            )}
            <svg
              className={`w-3.5 h-3.5 text-gray-400 dark:text-neutral-600 transition-transform duration-200 shrink-0 ${expanded ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
        </button>

        <AnimatePresence initial={false}>
          {expanded && marketPool && (
            <motion.div
              key="list-detail"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}
              className="border border-t-0 border-atelier/50 rounded-b-lg bg-white dark:bg-[#0d0d0d]"
            >
              <div className="px-4 py-4">
                <PoolPanel
                  pool={marketPool}
                  market={marketId}
                  positions={marketPositions}
                  positionsLoading={positionsLoading}
                  solanaAddress={solanaAddress}
                  solanaBalance={solanaBalance}
                  baseBalance={baseBalance}
                  balanceLoading={balanceLoading}
                  authenticated={authenticated}
                  canDeposit={canDeposit}
                  login={login}
                  onPoolRefresh={onPoolRefresh}
                  embedded
                />
              </div>
            </motion.div>
          )}
          {expanded && !marketPool && (
            <motion.div
              key="list-loading"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}
              className="border border-t-0 border-atelier/50 rounded-b-lg bg-white dark:bg-[#0d0d0d] px-4 py-8"
            >
              <div className="flex justify-center">
                <div className="w-4 h-4 rounded-full border-2 border-atelier/30 border-t-atelier animate-spin" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onToggle(marketId)}
      onKeyDown={handleKeyDown}
      aria-expanded={expanded}
      className={`relative rounded-xl border px-3.5 py-3.5 text-left w-full h-[110px] flex flex-col transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/60 ${
        expanded
          ? 'border-atelier/60 bg-atelier/5 dark:bg-atelier/5 shadow-[0_0_0_1px_rgb(250_76_20/0.2)]'
          : 'border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] hover:border-atelier/30 hover:bg-atelier/[0.02] hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono font-semibold text-[15px] text-black dark:text-white leading-tight">{ticker}</p>
          <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-500 mt-0.5">US Equity</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {initializing && (
            <span className="inline-flex h-4 px-1.5 rounded-full bg-gray-100 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 font-mono text-[9px] text-gray-500 dark:text-neutral-400 items-center">
              initializing
            </span>
          )}
          {stressed && (
            <span className="inline-flex h-4 px-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 font-mono text-[9px] text-amber-500 items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" />
              Stress
            </span>
          )}
          <svg
            className={`w-3 h-3 text-gray-300 dark:text-neutral-700 transition-transform duration-200 ${expanded ? 'rotate-180 text-atelier dark:text-atelier' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </div>

      <PositionPreview
        positionValue={positionValue ?? 0}
        positionPrincipal={positionPrincipal ?? 0}
        hasPosition={hasPosition}
        tvl={tvl}
      />
    </button>
  );
}

interface ExpandedPanelProps {
  marketId: string;
  panelPassthrough: PoolPanelPassthrough;
}

function ExpandedPanel({ marketId, panelPassthrough }: ExpandedPanelProps) {
  const { poolsByMarket, positions, positionsLoading, solanaAddress, solanaBalance, baseBalance, balanceLoading, authenticated, canDeposit, login, onPoolRefresh } = panelPassthrough;
  const pool = poolsByMarket[marketId] ?? null;
  const marketPositions = positions.filter((p) => p.pool_market === marketId);

  if (!pool) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-4 h-4 rounded-full border-2 border-atelier/30 border-t-atelier animate-spin" />
      </div>
    );
  }

  return (
    <PoolPanel
      pool={pool}
      market={marketId}
      positions={marketPositions}
      positionsLoading={positionsLoading}
      solanaAddress={solanaAddress}
      solanaBalance={solanaBalance}
      baseBalance={baseBalance}
      balanceLoading={balanceLoading}
      authenticated={authenticated}
      canDeposit={canDeposit}
      login={login}
      onPoolRefresh={onPoolRefresh}
      embedded
    />
  );
}

export interface MarketGridProps {
  poolsByMarket: Record<string, PoolData>;
  positions: Position[];
  positionsLoading: boolean;
  enabledMarkets: string[];
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

export function MarketGrid({
  poolsByMarket,
  positions,
  positionsLoading,
  enabledMarkets,
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
  const [layout, setLayout] = useState<GridLayout>('grid');
  const [sortBy, setSortBy] = useState<SortBy>('tvl');
  const [filterMine, setFilterMine] = useState(false);
  const [expandedMarketId, setExpandedMarketId] = useState<string | null>(null);
  const [colCount, setColCount] = useState(1);

  const prevExpandedRef = useRef<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const depositedByMarket = positions.reduce<Record<string, { value: number; principal: number }>>((acc, pos) => {
    const value = pos.value_usd !== null ? parseFloat(pos.value_usd) : parseFloat(pos.principal_usd);
    const principal = parseFloat(pos.principal_usd);
    const existing = acc[pos.pool_market];
    acc[pos.pool_market] = {
      value: (existing?.value ?? 0) + value,
      principal: (existing?.principal ?? 0) + principal,
    };
    return acc;
  }, {});

  const hasPositions = Object.keys(depositedByMarket).length > 0;

  const sortMarkets = useCallback((markets: string[]): string[] => {
    const withPosition: string[] = [];
    const without: string[] = [];
    for (const m of markets) {
      if (depositedByMarket[m]) withPosition.push(m);
      else without.push(m);
    }

    const compareFn = (a: string, b: string): number => {
      if (sortBy === 'tvl') {
        const aTvl = poolsByMarket[a] ? Number(poolsByMarket[a].total_usdc_micro) : 0;
        const bTvl = poolsByMarket[b] ? Number(poolsByMarket[b].total_usdc_micro) : 0;
        if (aTvl !== bTvl) return bTvl - aTvl;
      }
      return a.localeCompare(b);
    };

    return [...withPosition.sort(compareFn), ...without.sort(compareFn)];
  }, [depositedByMarket, sortBy, poolsByMarket]);

  const filteredMarkets = filterMine && hasPositions
    ? enabledMarkets.filter((m) => Boolean(depositedByMarket[m]))
    : enabledMarkets;

  const sortedMarkets = sortMarkets(filteredMarkets);

  const handleToggle = useCallback((marketId: string) => {
    setExpandedMarketId((prev) => {
      if (prev === marketId) return null;
      return marketId;
    });
  }, []);

  useEffect(() => {
    if (expandedMarketId && expandedMarketId !== prevExpandedRef.current) {
      void onFetchPool(expandedMarketId);
    }
    prevExpandedRef.current = expandedMarketId;
  }, [expandedMarketId, onFetchPool]);

  useEffect(() => {
    if (layout !== 'grid') return;
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const cols = getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length;
      setColCount(cols > 0 ? cols : 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout, sortedMarkets.length]);

  const panelPassthrough: PoolPanelPassthrough = {
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
  };

  const displayCount = sortedMarkets.length;
  const totalCount = enabledMarkets.length;

  const expandedIndex = expandedMarketId ? sortedMarkets.indexOf(expandedMarketId) : -1;
  const accordionAfterIndex = expandedIndex >= 0
    ? Math.min(Math.floor(expandedIndex / colCount) * colCount + colCount - 1, sortedMarkets.length - 1)
    : -1;

  const renderGridWithAccordion = () => {
    const elements: React.ReactNode[] = [];

    sortedMarkets.forEach((marketId, i) => {
      const dep = depositedByMarket[marketId] ?? null;
      const isExpanded = expandedMarketId === marketId;
      elements.push(
        <motion.div
          key={marketId}
          layout
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.25, delay: i * 0.02 }}
        >
          <MarketCard
            marketId={marketId}
            ticker={marketTicker(marketId)}
            pool={poolsByMarket[marketId] ?? null}
            expanded={isExpanded}
            positionValue={dep?.value ?? null}
            positionPrincipal={dep?.principal ?? null}
            layout="grid"
            panelPassthrough={panelPassthrough}
            onToggle={handleToggle}
          />
        </motion.div>
      );

      if (i === accordionAfterIndex && expandedMarketId) {
        elements.push(
          <div key={`accordion-${expandedMarketId}`} className="col-span-full">
            <AnimatePresence initial={false}>
              <motion.div
                key={expandedMarketId}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: 'easeInOut' }}
                style={{ overflow: 'hidden' }}
                className="rounded-xl border border-atelier/50 bg-white dark:bg-[#0d0d0d] mt-1"
              >
                <div className="px-5 py-5">
                  <ExpandedPanel marketId={expandedMarketId} panelPassthrough={panelPassthrough} />
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        );
      }
    });

    return elements;
  };

  return (
    <div className="px-4 py-6 md:px-8 border-b border-gray-200 dark:border-neutral-800/60">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-baseline gap-2">
          <h2 className="font-display font-semibold text-[15px] text-black dark:text-white">Markets</h2>
          <span className="font-mono text-[10px] text-gray-400 dark:text-neutral-600">
            {filterMine && displayCount < totalCount
              ? `${displayCount} of ${totalCount} live`
              : `${totalCount} live`}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {authenticated && hasPositions && (
            <button
              type="button"
              onClick={() => setFilterMine((v) => !v)}
              className={`h-7 px-2.5 rounded-md font-mono text-[10px] border transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/60 ${
                filterMine
                  ? 'border-atelier/50 bg-atelier/10 text-atelier dark:text-atelier'
                  : 'border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-400 hover:border-atelier/30 hover:text-atelier'
              }`}
            >
              My positions
            </button>
          )}

          <div className="flex items-center gap-1 p-0.5 rounded-lg border border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-black/40">
            <button
              type="button"
              onClick={() => setSortBy('tvl')}
              className={`h-6 px-2 rounded font-mono text-[10px] transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/60 ${
                sortBy === 'tvl'
                  ? 'bg-white dark:bg-neutral-800 text-black dark:text-white shadow-sm'
                  : 'text-gray-400 dark:text-neutral-600 hover:text-black dark:hover:text-white'
              }`}
            >
              TVL
            </button>
            <button
              type="button"
              onClick={() => setSortBy('alpha')}
              className={`h-6 px-2 rounded font-mono text-[10px] transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/60 ${
                sortBy === 'alpha'
                  ? 'bg-white dark:bg-neutral-800 text-black dark:text-white shadow-sm'
                  : 'text-gray-400 dark:text-neutral-600 hover:text-black dark:hover:text-white'
              }`}
            >
              A-Z
            </button>
          </div>

          <div className="flex items-center gap-1 p-0.5 rounded-lg border border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-black/40">
            <button
              type="button"
              onClick={() => setLayout('grid')}
              aria-label="Grid view"
              className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/60 ${
                layout === 'grid'
                  ? 'bg-white dark:bg-neutral-800 text-black dark:text-white shadow-sm'
                  : 'text-gray-400 dark:text-neutral-600 hover:text-black dark:hover:text-white'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
                <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
                <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
                <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setLayout('list')}
              aria-label="List view"
              className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/60 ${
                layout === 'list'
                  ? 'bg-white dark:bg-neutral-800 text-black dark:text-white shadow-sm'
                  : 'text-gray-400 dark:text-neutral-600 hover:text-black dark:hover:text-white'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <line x1="1" y1="3.5" x2="13" y2="3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <line x1="1" y1="10.5" x2="13" y2="10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {sortedMarkets.length === 0 ? (
        <div className="py-10 text-center">
          <p className="font-mono text-[11px] text-gray-400 dark:text-neutral-600">
            {filterMine ? 'No positions yet.' : 'No markets available.'}
          </p>
        </div>
      ) : layout === 'grid' ? (
        <div ref={gridRef} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
          {renderGridWithAccordion()}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {sortedMarkets.map((marketId, i) => {
            const dep = depositedByMarket[marketId] ?? null;
            return (
              <motion.div
                key={marketId}
                layout
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.2, delay: i * 0.015 }}
              >
                <MarketCard
                  marketId={marketId}
                  ticker={marketTicker(marketId)}
                  pool={poolsByMarket[marketId] ?? null}
                  expanded={expandedMarketId === marketId}
                  positionValue={dep?.value ?? null}
                  positionPrincipal={dep?.principal ?? null}
                  layout="list"
                  panelPassthrough={panelPassthrough}
                  onToggle={handleToggle}
                />
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
