'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { marketTicker, type PoolData, type Position, formatUsd, microToUsd } from './types';

type GridLayout = 'grid' | 'list';

interface MarketCardProps {
  marketId: string;
  ticker: string;
  pool: PoolData | null;
  selected: boolean;
  depositedValue: number | null;
  layout: GridLayout;
  onSelect: (id: string) => void;
}

function MarketCard({ marketId, ticker, pool, selected, depositedValue, layout, onSelect }: MarketCardProps) {
  const tvl = pool ? formatUsd(microToUsd(pool.total_usdc_micro)) : null;
  const stressed = pool?.stressed ?? false;

  if (layout === 'list') {
    return (
      <button
        type="button"
        onClick={() => onSelect(marketId)}
        className={`flex items-center justify-between gap-3 w-full px-4 py-2.5 rounded-lg border text-left transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/60 min-h-[44px] ${
          selected
            ? 'border-atelier/50 bg-atelier/5 dark:bg-atelier/5'
            : 'border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] hover:border-atelier/30 hover:bg-atelier/[0.02]'
        }`}
      >
        <div className="flex items-center gap-3">
          <p className="font-mono font-semibold text-[13px] text-black dark:text-white w-14">{ticker}</p>
          <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-500">US Equity</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {stressed && (
            <span className="inline-flex h-4 px-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 font-mono text-[9px] text-amber-500 items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" />
              Stress
            </span>
          )}
          {tvl !== null ? (
            <span className="font-mono text-[11px] tabular-nums text-black dark:text-white">${tvl}</span>
          ) : (
            <span className="h-3 w-10 rounded bg-gray-100 dark:bg-neutral-800 animate-pulse inline-block" />
          )}
          {depositedValue !== null && (
            <span className="font-mono text-[10px] text-atelier tabular-nums">${formatUsd(depositedValue)}</span>
          )}
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(marketId)}
      className={`relative rounded-xl border px-4 py-4 text-left w-full transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/60 min-h-[44px] ${
        selected
          ? 'border-atelier/50 bg-atelier/5 dark:bg-atelier/5 shadow-[0_0_0_1px_rgb(250_76_20/0.15)]'
          : 'border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] hover:border-atelier/30 hover:bg-atelier/[0.02]'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-mono font-semibold text-[15px] text-black dark:text-white">{ticker}</p>
          <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-500">US Equity</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {stressed && (
            <span className="inline-flex h-4 px-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 font-mono text-[9px] text-amber-500 items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" />
              Stress
            </span>
          )}
          {depositedValue !== null && (
            <span className="font-mono text-[9px] text-atelier shrink-0 tabular-nums">
              ${formatUsd(depositedValue)}
            </span>
          )}
        </div>
      </div>

      {tvl !== null ? (
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-600 mb-0.5">TVL</p>
          <p className="font-mono text-[14px] text-black dark:text-white tabular-nums">${tvl}</p>
        </div>
      ) : (
        <div className="h-4 w-16 rounded bg-gray-100 dark:bg-neutral-800 animate-pulse" />
      )}
    </button>
  );
}

interface MarketGridProps {
  poolsByMarket: Record<string, PoolData>;
  positions: Position[];
  enabledMarkets: string[];
  selectedMarketId: string;
  onSelectMarket: (id: string) => void;
}

export function MarketGrid({ poolsByMarket, positions, enabledMarkets, selectedMarketId, onSelectMarket }: MarketGridProps) {
  const [layout, setLayout] = useState<GridLayout>('grid');

  const depositedByMarket = positions.reduce<Record<string, number>>((acc, pos) => {
    const value = pos.value_usd !== null ? parseFloat(pos.value_usd) : parseFloat(pos.principal_usd);
    acc[pos.pool_market] = (acc[pos.pool_market] ?? 0) + value;
    return acc;
  }, {});

  const sortedMarkets = [...enabledMarkets].sort((a, b) => {
    const aDeposited = depositedByMarket[a] ?? 0;
    const bDeposited = depositedByMarket[b] ?? 0;
    if (aDeposited !== bDeposited) return bDeposited - aDeposited;
    return a.localeCompare(b);
  });

  return (
    <div className="px-4 py-6 md:px-8 border-b border-gray-200 dark:border-neutral-800/60">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-baseline gap-2">
          <h2 className="font-display font-semibold text-[15px] text-black dark:text-white">Markets</h2>
          <span className="font-mono text-[10px] text-gray-400 dark:text-neutral-600">{enabledMarkets.length} live</span>
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

      {layout === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
          {sortedMarkets.map((marketId, i) => (
            <motion.div
              key={marketId}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.3, delay: i * 0.03 }}
            >
              <MarketCard
                marketId={marketId}
                ticker={marketTicker(marketId)}
                pool={poolsByMarket[marketId] ?? null}
                selected={selectedMarketId === marketId}
                depositedValue={depositedByMarket[marketId] ?? null}
                layout="grid"
                onSelect={onSelectMarket}
              />
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {sortedMarkets.map((marketId, i) => (
            <motion.div
              key={marketId}
              initial={{ opacity: 0, x: -8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.25, delay: i * 0.02 }}
            >
              <MarketCard
                marketId={marketId}
                ticker={marketTicker(marketId)}
                pool={poolsByMarket[marketId] ?? null}
                selected={selectedMarketId === marketId}
                depositedValue={depositedByMarket[marketId] ?? null}
                layout="list"
                onSelect={onSelectMarket}
              />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
