'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { useUsdcBalances } from '@/hooks/use-usdc-balances';
import { EarnHero } from '@/components/atelier/earn/EarnHero';
import { MarketGrid } from '@/components/atelier/earn/MarketGrid';
import { PoolPanel } from '@/components/atelier/earn/PoolPanel';
import type { PoolData } from '@/components/atelier/earn/types';

export function EarnPageClient() {
  const { authenticated, ready, login, solanaAddress } = useAtelierAuth();
  const balances = useUsdcBalances();

  const [pool, setPool] = useState<PoolData | null>(null);
  const [poolLoading, setPoolLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);
  const [selectedMarketId, setSelectedMarketId] = useState('intc-usdc');

  const fetchPool = useCallback(async () => {
    setPoolLoading(true);
    try {
      const res = await fetch('/api/earn/parquet/pools');
      if (res.status === 503) {
        setNotConfigured(true);
        return;
      }
      const json = await res.json() as { success: boolean; data?: PoolData; error?: string };
      if (json.success && json.data) {
        setPool(json.data);
        setNotConfigured(false);
      } else {
        setNotConfigured(true);
      }
    } catch {
      setNotConfigured(true);
    } finally {
      setPoolLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPool();
  }, [fetchPool]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-5 h-5 rounded-full border-2 border-atelier/30 border-t-atelier animate-spin" />
      </div>
    );
  }

  const showPoolPanel = !notConfigured && selectedMarketId === 'intc-usdc';

  return (
    <div className="max-w-5xl mx-auto">
      <EarnHero />

      <MarketGrid
        pool={pool}
        selectedMarketId={selectedMarketId}
        onSelectMarket={setSelectedMarketId}
      />

      {/* Selected pool panel */}
      <div className="px-4 py-6 md:px-8">
        {notConfigured ? (
          <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] px-5 py-8 text-center">
            <p className="font-mono text-[11px] text-gray-400 dark:text-neutral-500">
              Parquet Earn — coming soon
            </p>
          </div>
        ) : poolLoading ? (
          <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] px-5 py-8">
            <div className="space-y-3">
              <div className="h-4 w-32 rounded bg-gray-200 dark:bg-neutral-800 animate-pulse" />
              <div className="h-8 w-24 rounded bg-gray-200 dark:bg-neutral-800 animate-pulse" />
              <div className="h-3 w-40 rounded bg-gray-100 dark:bg-neutral-800/60 animate-pulse" />
            </div>
          </div>
        ) : showPoolPanel && pool ? (
          <PoolPanel
            pool={pool}
            solanaAddress={solanaAddress}
            solanaBalance={balances.solana}
            baseBalance={balances.base}
            balanceLoading={balances.loading}
            authenticated={authenticated}
            login={login}
            onPoolRefresh={fetchPool}
          />
        ) : selectedMarketId !== 'intc-usdc' ? (
          <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] px-5 py-8 text-center">
            <p className="font-mono text-[12px] font-medium text-black dark:text-white mb-1">Coming soon</p>
            <p className="font-mono text-[11px] text-gray-400 dark:text-neutral-500">
              This market is not yet open for deposits.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
