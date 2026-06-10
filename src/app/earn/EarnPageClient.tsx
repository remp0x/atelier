'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { useUsdcBalances } from '@/hooks/use-usdc-balances';
import { getPrivyAccessToken } from '@/lib/privy-client';
import { isEarnDepositsOpen, isEarnAdminEmail } from '@/lib/earn-access';
import { EarnHero } from '@/components/atelier/earn/EarnHero';
import { MarketGrid } from '@/components/atelier/earn/MarketGrid';
import type { PoolData, Position } from '@/components/atelier/earn/types';

interface MarketsResponse {
  treasury_wallet: string | null;
  enabled: string[];
  markets?: PoolData[];
}

const AUTO_REFRESH_MS = 45_000;

export function EarnPageClient() {
  const { authenticated, ready, login, solanaAddress, user } = useAtelierAuth();
  const adminEmail = user?.google?.email ?? user?.email?.address ?? null;
  const canDeposit = isEarnDepositsOpen() || isEarnAdminEmail(adminEmail);
  const balances = useUsdcBalances();

  const [enabledMarkets, setEnabledMarkets] = useState<string[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);

  const [poolsByMarket, setPoolsByMarket] = useState<Record<string, PoolData>>({});

  const [positions, setPositions] = useState<Position[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);

  // silent = background refresh: never flash loading skeletons and never flip
  // the page into the not-configured state on a transient failure.
  const fetchMarkets = useCallback(async (silent = false) => {
    if (!silent) setMarketsLoading(true);
    try {
      const res = await fetch('/api/earn/parquet/markets');
      if (res.status === 503) {
        if (!silent) setNotConfigured(true);
        return;
      }
      const json = await res.json() as { success: boolean; data?: MarketsResponse; error?: string };
      if (json.success && json.data) {
        setNotConfigured(false);
        setEnabledMarkets(json.data.enabled);
        setPoolsByMarket((prev) => {
          const next = { ...prev };
          for (const p of json.data!.markets ?? []) next[p.market] = p;
          return next;
        });
      } else if (!silent) {
        setNotConfigured(true);
      }
    } catch {
      if (!silent) setNotConfigured(true);
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

  // Keep TVL, fee APR and positions breathing while the tab is open.
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

  if (notConfigured) {
    return (
      <div className="max-w-5xl mx-auto">
        <EarnHero />
        <div className="px-4 py-6 md:px-8">
          <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] px-5 py-8 text-center">
            <p className="font-mono text-[11px] text-gray-400 dark:text-neutral-500">
              Parquet Earn — coming soon
            </p>
          </div>
        </div>
        <div className="px-4 pb-10 md:px-8">
          <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-600 leading-relaxed max-w-xl">
            * Principal at risk. The pool is the counterparty to leveraged traders. Your deposit can lose value if the pool takes losses. Only deposit what you can afford to lose.
          </p>
        </div>
      </div>
    );
  }

  if (marketsLoading) {
    return (
      <div className="max-w-5xl mx-auto">
        <EarnHero />
        <div className="px-4 py-6 md:px-8">
          <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] px-5 py-8">
            <div className="space-y-3">
              <div className="h-4 w-32 rounded bg-gray-200 dark:bg-neutral-800 animate-pulse" />
              <div className="h-8 w-24 rounded bg-gray-200 dark:bg-neutral-800 animate-pulse" />
              <div className="h-3 w-40 rounded bg-gray-100 dark:bg-neutral-800/60 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <EarnHero />

      <MarketGrid
        poolsByMarket={poolsByMarket}
        positions={positions}
        positionsLoading={positionsLoading}
        enabledMarkets={enabledMarkets}
        solanaAddress={solanaAddress}
        solanaBalance={balances.solana}
        baseBalance={balances.base}
        balanceLoading={balances.loading}
        authenticated={authenticated}
        canDeposit={canDeposit}
        login={login}
        onPoolRefresh={refreshAll}
        onFetchPool={fetchPool}
      />

      <div className="mt-6 px-4 pt-6 pb-10 md:px-8 border-t border-gray-200 dark:border-neutral-800/60 space-y-3">
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
    </div>
  );
}
