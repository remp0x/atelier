'use client';

import { motion } from 'framer-motion';
import { MARKETS, type MarketDefinition, type PoolData, type Position, formatUsd, microToUsd } from './types';

interface MarketCardProps {
  market: MarketDefinition;
  pool: PoolData | null;
  selected: boolean;
  depositedValue: number | null;
  onSelect: (id: string) => void;
}

function MarketCard({ market, pool, selected, depositedValue, onSelect }: MarketCardProps) {
  const tvl = pool ? formatUsd(microToUsd(pool.total_usdc_micro)) : null;
  const stressed = pool?.stressed ?? false;

  if (!market.enabled) {
    return (
      <div
        aria-disabled="true"
        className="relative rounded-xl border border-gray-100 dark:border-neutral-800/40 bg-gray-50/30 dark:bg-black/20 px-4 py-4 cursor-not-allowed opacity-40 select-none"
      >
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="font-mono font-semibold text-[15px] text-black dark:text-white">{market.ticker}</p>
            <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-600">{market.subtitle}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="inline-flex h-4 px-1.5 rounded-full bg-gray-100 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 font-mono text-[9px] text-gray-400 dark:text-neutral-600 items-center shrink-0">
              Soon
            </span>
            {depositedValue !== null && (
              <span className="inline-flex items-center gap-1 h-4 px-1.5 rounded-full bg-atelier/10 border border-atelier/25 font-mono text-[9px] text-atelier items-center shrink-0">
                <span className="w-1 h-1 rounded-full bg-atelier shrink-0" />
                ${formatUsd(depositedValue)}
              </span>
            )}
          </div>
        </div>
        <div className="h-4 w-16 rounded bg-gray-200 dark:bg-neutral-800/40" />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(market.id)}
      className={`relative rounded-xl border px-4 py-4 text-left w-full transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/60 min-h-[44px] ${
        selected
          ? 'border-atelier/50 bg-atelier/5 dark:bg-atelier/5 shadow-[0_0_0_1px_rgb(250_76_20/0.15)]'
          : 'border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] hover:border-atelier/30 hover:bg-atelier/[0.02]'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-mono font-semibold text-[15px] text-black dark:text-white">{market.ticker}</p>
          <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-500">{market.subtitle}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="inline-flex h-4 px-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 font-mono text-[9px] text-emerald-500 items-center">
            Live
          </span>
          {stressed && (
            <span className="inline-flex h-4 px-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 font-mono text-[9px] text-amber-500 items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" />
              Stress
            </span>
          )}
          {depositedValue !== null && (
            <span className="inline-flex items-center gap-1 h-4 px-1.5 rounded-full bg-atelier/10 border border-atelier/25 font-mono text-[9px] text-atelier shrink-0">
              <span className="w-1 h-1 rounded-full bg-atelier shrink-0" />
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

      <div className="mt-2 pt-2 border-t border-gray-100 dark:border-neutral-800/50">
        <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-600">LPs earn 60% of trading fees</p>
      </div>

      {selected && (
        <span className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-atelier" />
      )}
    </button>
  );
}

interface MarketGridProps {
  pool: PoolData | null;
  positions: Position[];
  selectedMarketId: string;
  onSelectMarket: (id: string) => void;
}

export function MarketGrid({ pool, positions, selectedMarketId, onSelectMarket }: MarketGridProps) {
  const depositedByMarket = positions.reduce<Record<string, number>>((acc, pos) => {
    const value = pos.value_usd !== null ? parseFloat(pos.value_usd) : parseFloat(pos.principal_usd);
    acc[pos.pool_market] = (acc[pos.pool_market] ?? 0) + value;
    return acc;
  }, {});

  return (
    <div className="px-4 py-6 md:px-8 border-b border-gray-200 dark:border-neutral-800/60">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-display font-semibold text-[15px] text-black dark:text-white">Markets</h2>
        <span className="font-mono text-[10px] text-gray-400 dark:text-neutral-600">{MARKETS.filter(m => m.enabled).length} live</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
        {MARKETS.map((market, i) => (
          <motion.div
            key={market.id}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.3, delay: i * 0.03 }}
          >
            <MarketCard
              market={market}
              pool={market.id === 'intc-usdc' ? pool : null}
              selected={selectedMarketId === market.id}
              depositedValue={depositedByMarket[market.id] ?? null}
              onSelect={onSelectMarket}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
