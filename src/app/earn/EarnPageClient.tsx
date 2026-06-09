'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { useUsdcBalances } from '@/hooks/use-usdc-balances';
import { getPrivyAccessToken } from '@/lib/privy-client';
import { isEarnPublic, isEarnAdminEmail } from '@/lib/earn-access';
import { EarnHero } from '@/components/atelier/earn/EarnHero';
import { MarketGrid } from '@/components/atelier/earn/MarketGrid';
import { PoolPanel } from '@/components/atelier/earn/PoolPanel';
import type { PoolData, Position } from '@/components/atelier/earn/types';

interface MarketsResponse {
  treasury_wallet: string | null;
  enabled: string[];
}

export function EarnPageClient() {
  const { authenticated, ready, login, solanaAddress, user } = useAtelierAuth();
  const adminEmail = user?.google?.email ?? user?.email?.address ?? null;
  const balances = useUsdcBalances();

  const [enabledMarkets, setEnabledMarkets] = useState<string[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);

  const [poolsByMarket, setPoolsByMarket] = useState<Record<string, PoolData>>({});
  const [poolLoading, setPoolLoading] = useState(false);
  const [selectedMarketId, setSelectedMarketId] = useState<string>('');

  const [positions, setPositions] = useState<Position[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);

  const fetchMarkets = useCallback(async () => {
    setMarketsLoading(true);
    try {
      const res = await fetch('/api/earn/parquet/markets');
      if (res.status === 503) {
        setNotConfigured(true);
        return;
      }
      const json = await res.json() as { success: boolean; data?: MarketsResponse; error?: string };
      if (json.success && json.data) {
        setNotConfigured(false);
        setEnabledMarkets(json.data.enabled);
        setSelectedMarketId((prev) => {
          if (prev && json.data!.enabled.includes(prev)) return prev;
          return json.data!.enabled[0] ?? '';
        });
      } else {
        setNotConfigured(true);
      }
    } catch {
      setNotConfigured(true);
    } finally {
      setMarketsLoading(false);
    }
  }, []);

  const fetchPool = useCallback(async (marketId: string) => {
    if (!marketId) return;
    setPoolLoading(true);
    try {
      const res = await fetch(`/api/earn/parquet/pools?market=${encodeURIComponent(marketId)}`);
      if (res.status === 503) return;
      const json = await res.json() as { success: boolean; data?: PoolData; error?: string };
      if (json.success && json.data) {
        setPoolsByMarket((prev) => ({ ...prev, [marketId]: json.data! }));
      }
    } catch {
      // non-fatal: pool stats remain stale
    } finally {
      setPoolLoading(false);
    }
  }, []);

  const fetchPositions = useCallback(async () => {
    if (!authenticated) return;
    setPositionsLoading(true);
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
      setPositionsLoading(false);
    }
  }, [authenticated]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchPool(selectedMarketId), fetchPositions()]);
  }, [fetchPool, fetchPositions, selectedMarketId]);

  useEffect(() => {
    void fetchMarkets();
  }, [fetchMarkets]);

  useEffect(() => {
    if (selectedMarketId && enabledMarkets.includes(selectedMarketId)) {
      void fetchPool(selectedMarketId);
    }
  }, [selectedMarketId, enabledMarkets, fetchPool]);

  useEffect(() => {
    void fetchPositions();
  }, [fetchPositions]);

  const handleSelectMarket = useCallback((id: string) => {
    setSelectedMarketId(id);
  }, []);

  const canDeposit = isEarnPublic() || isEarnAdminEmail(adminEmail);

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-5 h-5 rounded-full border-2 border-atelier/30 border-t-atelier animate-spin" />
      </div>
    );
  }

  const selectedPool = poolsByMarket[selectedMarketId] ?? null;
  const isSelectedEnabled = enabledMarkets.includes(selectedMarketId);

  return (
    <div className="max-w-5xl mx-auto">
      <EarnHero />

      <MarketGrid
        poolsByMarket={poolsByMarket}
        positions={positions}
        enabledMarkets={enabledMarkets}
        selectedMarketId={selectedMarketId}
        onSelectMarket={handleSelectMarket}
      />

      <div className="px-4 py-6 md:px-8">
        {notConfigured ? (
          <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] px-5 py-8 text-center">
            <p className="font-mono text-[11px] text-gray-400 dark:text-neutral-500">
              Parquet Earn — coming soon
            </p>
          </div>
        ) : marketsLoading || (isSelectedEnabled && poolLoading && !selectedPool) ? (
          <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] px-5 py-8">
            <div className="space-y-3">
              <div className="h-4 w-32 rounded bg-gray-200 dark:bg-neutral-800 animate-pulse" />
              <div className="h-8 w-24 rounded bg-gray-200 dark:bg-neutral-800 animate-pulse" />
              <div className="h-3 w-40 rounded bg-gray-100 dark:bg-neutral-800/60 animate-pulse" />
            </div>
          </div>
        ) : isSelectedEnabled && selectedPool ? (
          <PoolPanel
            pool={selectedPool}
            market={selectedMarketId}
            positions={positions}
            positionsLoading={positionsLoading}
            solanaAddress={solanaAddress}
            solanaBalance={balances.solana}
            baseBalance={balances.base}
            balanceLoading={balances.loading}
            authenticated={authenticated}
            canDeposit={canDeposit}
            login={login}
            onPoolRefresh={refreshAll}
          />
        ) : selectedMarketId && !isSelectedEnabled ? (
          <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] px-5 py-8 text-center">
            <p className="font-mono text-[12px] font-medium text-black dark:text-white mb-1">Coming soon</p>
            <p className="font-mono text-[11px] text-gray-400 dark:text-neutral-500">
              This market is not yet open for deposits.
            </p>
          </div>
        ) : null}
      </div>

      <div className="px-4 pb-10 md:px-8">
        <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-600 leading-relaxed max-w-xl">
          * Principal at risk. The pool is the counterparty to leveraged traders. Your deposit can lose value if the pool takes losses. Only deposit what you can afford to lose.
        </p>
      </div>
    </div>
  );
}
