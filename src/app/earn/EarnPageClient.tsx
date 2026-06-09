'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { useUsdcBalances } from '@/hooks/use-usdc-balances';
import { EarnHero } from '@/components/atelier/earn/EarnHero';
import { MarketGrid } from '@/components/atelier/earn/MarketGrid';
import { PoolPanel } from '@/components/atelier/earn/PoolPanel';
import type { PoolData } from '@/components/atelier/earn/types';

function LoginPrompt({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] px-4 text-center gap-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-atelier">EARN</p>
      <h1 className="font-display font-bold text-xl tracking-[-0.02em] text-black dark:text-white">
        Sign in to access Earn
      </h1>
      <p className="text-[13px] text-gray-500 dark:text-neutral-400 max-w-xs">
        Deposit USDC into Parquet liquidity pools and earn trading fee revenue.
      </p>
      <button
        type="button"
        onClick={onLogin}
        className="h-10 px-5 rounded-lg font-mono text-xs font-semibold text-white bg-gradient-to-br from-[#7a2808] via-[#9a2906] to-[#c93a0a] hover:from-[#9a2906] hover:via-[#c93a0a] hover:to-[#fa4c14] transition-all cursor-pointer"
      >
        Sign In
      </button>
    </div>
  );
}

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

  if (!authenticated) {
    return <LoginPrompt onLogin={login} />;
  }

  const showPoolPanel = !notConfigured && selectedMarketId === 'intc-usdc' && authenticated && solanaAddress;

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
