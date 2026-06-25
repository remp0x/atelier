'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { useUsdcBalances } from '@/hooks/use-usdc-balances';
import { getPrivyAccessToken } from '@/lib/privy-client';
import { isEarnDepositsOpen, isEarnAdminEmail } from '@/lib/earn-access';
import { EarnHero } from '@/components/atelier/earn/EarnHero';
import { StrategyMenu } from '@/components/atelier/earn/StrategyMenu';
import { MarketGrid } from '@/components/atelier/earn/MarketGrid';
import { LendingMarketCard } from '@/components/atelier/earn/LendingMarketCard';
import type {
  ProductData,
  PoolData,
  ParquetMarketEntry,
  SolendMarketEntry,
  Position,
} from '@/components/atelier/earn/types';

interface MarketsApiResponse {
  products: ProductData[];
  enabled: string[];
  markets?: PoolData[];
}

const AUTO_REFRESH_MS = 45_000;

export function EarnPageClient() {
  const { authenticated, ready, login, solanaAddress, user } = useAtelierAuth();
  const adminEmail = user?.google?.email ?? user?.email?.address ?? null;
  const canDeposit = isEarnDepositsOpen() || isEarnAdminEmail(adminEmail);
  const balances = useUsdcBalances();

  const [products, setProducts] = useState<ProductData[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(true);
  const [poolsByMarket, setPoolsByMarket] = useState<Record<string, PoolData>>({});

  const [positions, setPositions] = useState<Position[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);

  const [activeProductId, setActiveProductId] = useState<string | null>(null);

  const fetchMarkets = useCallback(async (silent = false) => {
    if (!silent) setMarketsLoading(true);
    try {
      const res = await fetch('/api/earn/parquet/markets');
      if (res.status === 503) return;
      const json = await res.json() as { success: boolean; data?: MarketsApiResponse; error?: string };
      if (json.success && json.data?.products) {
        setProducts(json.data.products);
        setPoolsByMarket((prev) => {
          const next = { ...prev };
          for (const p of json.data!.markets ?? []) next[p.market] = p;
          return next;
        });
      }
    } catch {
      // markets unavailable; show empty state
    } finally {
      if (!silent) setMarketsLoading(false);
    }
  }, []);

  const fetchPool = useCallback(async (marketId: string) => {
    if (!marketId) return;
    try {
      const res = await fetch(`/api/earn/parquet/pools?market=${encodeURIComponent(marketId)}`);
      if (res.status === 503) return;
      const json = await res.json() as { success: boolean; data?: PoolData; error?: string };
      if (json.success && json.data) {
        setPoolsByMarket((prev) => ({ ...prev, [marketId]: json.data! }));
      }
    } catch {
      // non-fatal: pool stats remain stale
    }
  }, []);

  const fetchPositions = useCallback(async (silent = false) => {
    if (!authenticated) return;
    if (!silent) setPositionsLoading(true);
    try {
      const token = await getPrivyAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/earn/parquet/positions', { headers });
      if (!res.ok) return;
      const json = await res.json() as { success: boolean; data?: Position[] };
      if (json.success && json.data) setPositions(json.data);
    } catch {
      // positions are a convenience display; fail silently
    } finally {
      if (!silent) setPositionsLoading(false);
    }
  }, [authenticated]);

  const refreshAll = useCallback(async (market: string) => {
    await Promise.all([fetchPool(market), fetchPositions()]);
  }, [fetchPool, fetchPositions]);

  useEffect(() => {
    void fetchMarkets();
  }, [fetchMarkets]);

  useEffect(() => {
    void fetchPositions();
  }, [fetchPositions]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void fetchMarkets(true);
      void fetchPositions(true);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchMarkets, fetchPositions]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-5 h-5 rounded-full border-2 border-atelier/30 border-t-atelier animate-spin" />
      </div>
    );
  }

  const activeProduct = products.find((p) => p.id === activeProductId) ?? null;

  const parquetProduct = activeProduct?.kind === 'liquidity_provision' ? activeProduct : null;
  const solendProduct = activeProduct?.kind === 'lending' ? activeProduct : null;

  const parquetMarkets = (parquetProduct?.markets ?? []) as ParquetMarketEntry[];
  const solendMarkets = (solendProduct?.markets ?? []) as SolendMarketEntry[];

  if (marketsLoading) {
    return (
      <div className="max-w-5xl mx-auto">
        <EarnHero positions={[]} positionsLoading={false} authenticated={authenticated} />
        <div className="px-4 py-6 md:px-8">
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] px-5 py-6"
              >
                <div className="space-y-3">
                  <div className="h-4 w-32 rounded bg-gray-200 dark:bg-neutral-800 animate-pulse" />
                  <div className="h-8 w-24 rounded bg-gray-200 dark:bg-neutral-800 animate-pulse" />
                  <div className="h-3 w-40 rounded bg-gray-100 dark:bg-neutral-800/60 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <EarnHero
        positions={positions}
        positionsLoading={positionsLoading}
        authenticated={authenticated}
      />

      <div className="px-4 py-6 md:px-8">
        <AnimatePresence mode="wait">
          {activeProduct === null ? (
            <motion.div
              key="hub"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <StrategyMenu
                products={products}
                onSelect={(id) => setActiveProductId(id)}
              />
            </motion.div>
          ) : (
            <motion.div
              key={activeProduct.id}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.22 }}
            >
              <ProductView
                product={activeProduct}
                parquetMarkets={parquetMarkets}
                solendMarkets={solendMarkets}
                poolsByMarket={poolsByMarket}
                positions={positions}
                positionsLoading={positionsLoading}
                solanaAddress={solanaAddress}
                solanaBalance={balances.solana}
                baseBalance={balances.base}
                balanceLoading={balances.loading}
                authenticated={authenticated}
                canDeposit={canDeposit}
                login={login}
                onBack={() => setActiveProductId(null)}
                onPoolRefresh={refreshAll}
                onFetchPool={fetchPool}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface ProductViewProps {
  product: ProductData;
  parquetMarkets: ParquetMarketEntry[];
  solendMarkets: SolendMarketEntry[];
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
  onBack: () => void;
  onPoolRefresh: (market: string) => Promise<void>;
  onFetchPool: (marketId: string) => Promise<void>;
}

function ProductView({
  product,
  parquetMarkets,
  solendMarkets,
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
  onBack,
  onPoolRefresh,
  onFetchPool,
}: ProductViewProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg font-mono text-[11px] border border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-400 hover:border-atelier/40 hover:text-atelier transition-colors cursor-pointer shrink-0"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          All strategies
        </button>
        <span className="font-mono text-[11px] text-gray-400 dark:text-neutral-600">/</span>
        <span className="font-display font-semibold text-[14px] text-black dark:text-white">{product.label}</span>
      </div>

      {product.kind === 'liquidity_provision' && (
        <>
          <MarketGrid
            markets={parquetMarkets}
            poolsByMarket={poolsByMarket}
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
          <div className="pt-2 space-y-2">
            <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-600 leading-relaxed max-w-xl">
              * Principal at risk. The pool is the counterparty to leveraged traders. Your deposit can lose value if the pool takes losses. Only deposit what you can afford to lose.
            </p>
            <a
              href="https://parquet.exchange"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-[10px] text-gray-400 dark:text-neutral-500 hover:text-atelier transition-colors"
            >
              Liquidity pools powered by Parquet
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          </div>
        </>
      )}

      {product.kind === 'lending' && (
        <>
          {solendMarkets.length === 0 ? (
            <div className="py-10 text-center">
              <p className="font-mono text-[11px] text-gray-400 dark:text-neutral-600">No lending markets available.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {solendMarkets.map((market) => (
                <LendingMarketCard
                  key={market.key}
                  market={market}
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
                />
              ))}
            </div>
          )}
          <div className="pt-2 space-y-2">
            <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-600 leading-relaxed max-w-xl">
              Variable APY. Withdrawals can be delayed when utilization is high. Smart-contract risk applies. You are not the counterparty to leveraged traders.
            </p>
            <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-500">
              Lending markets powered by Solend, Kamino &amp; Meteora.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
