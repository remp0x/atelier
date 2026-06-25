'use client';

import { motion } from 'framer-motion';
import type { ProductData } from './types';
import { formatUsd, formatAprPct, microToUsd } from './types';

interface StrategyMenuProps {
  products: ProductData[];
  onSelect: (productId: string) => void;
}

function RiskBadge({ risk }: { risk: 'lower' | 'higher' }) {
  if (risk === 'lower') {
    return (
      <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 font-mono text-[9px] text-emerald-600 dark:text-emerald-400 shrink-0">
        <span className="w-1 h-1 rounded-full bg-emerald-500 shrink-0" />
        Lower risk
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-amber-500/10 border border-amber-500/20 font-mono text-[9px] text-amber-600 dark:text-amber-400 shrink-0">
      <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" />
      Higher risk
    </span>
  );
}

const PRODUCT_PITCH: Record<string, string> = {
  lending: 'Supply USDC to money markets (Solend, Kamino, Meteora) and earn interest as borrowers pay. Steadier yield, lower volatility.',
  liquidity_provision: 'Provide liquidity to perpetuals pools and collect a share of every trading fee. Higher fees, principal at risk.',
};

const PRODUCT_ICON: Record<string, React.ReactNode> = {
  lending: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
    </svg>
  ),
  liquidity_provision: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
    </svg>
  ),
};

function ProductCard({
  product,
  index,
  onSelect,
}: {
  product: ProductData;
  index: number;
  onSelect: () => void;
}) {
  const tvl = microToUsd(product.total_tvl_micro);
  const aprDisplay =
    product.headline_apr_pct !== null ? formatAprPct(product.headline_apr_pct) : 'Variable';
  const aprPositive = product.headline_apr_pct !== null && product.headline_apr_pct > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.08 }}
      className="group relative rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] overflow-hidden hover:border-atelier/30 transition-colors duration-200"
    >
      <div className="px-5 pt-5 pb-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-atelier/10 border border-atelier/20 text-atelier shrink-0">
              {PRODUCT_ICON[product.id] ?? PRODUCT_ICON['liquidity_provision']}
            </span>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="font-display font-bold text-[18px] text-black dark:text-white leading-tight tracking-[-0.02em]">
                  {product.label}
                </h3>
                <RiskBadge risk={product.risk} />
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className={`font-mono text-[22px] font-semibold tabular-nums leading-none ${aprPositive ? 'text-emerald-500 dark:text-emerald-400' : 'text-gray-400 dark:text-neutral-500'}`}>
              {aprDisplay}
            </p>
            <p className="font-mono text-[9px] text-gray-400 dark:text-neutral-600 mt-0.5">{product.apr_label}</p>
          </div>
        </div>

        <p className="text-[13px] text-gray-500 dark:text-neutral-400 leading-relaxed mb-4">
          {PRODUCT_PITCH[product.id] ?? ''}
        </p>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-600 mb-0.5">TVL</p>
            <p className="font-mono text-[14px] font-semibold tabular-nums text-black dark:text-white">
              ${formatUsd(tvl)}
            </p>
          </div>
          <button
            type="button"
            onClick={onSelect}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg font-mono text-[12px] font-medium border border-atelier/40 text-atelier hover:bg-atelier hover:text-white hover:border-atelier focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/60 transition-colors cursor-pointer"
          >
            Open
            <svg className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export function StrategyMenu({ products, onSelect }: StrategyMenuProps) {
  if (products.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="font-mono text-[11px] text-gray-400 dark:text-neutral-600">No strategies available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center gap-2"
      >
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gray-400 dark:text-neutral-600">
          Strategies &mdash; lower risk first
        </p>
      </motion.div>
      {products.map((product, i) => (
        <ProductCard
          key={product.id}
          product={product}
          index={i}
          onSelect={() => onSelect(product.id)}
        />
      ))}
    </div>
  );
}
