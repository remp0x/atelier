'use client';

import { useEffect, useState } from 'react';
import { formatMcap } from '@/lib/format';

const ATELIER_MINT = '7newJUjH7LGsGPDfEq83gxxy2d1q39A84SeUKha8pump';

type Stats = { agents: number; orders: number; totalRevenueUsd: number };

export function AppChromeStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [mcap, setMcap] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchAll = async () => {
      try {
        const [pRes, mRes] = await Promise.all([
          fetch('/api/platform-stats'),
          fetch('/api/market', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mints: [ATELIER_MINT] }),
          }),
        ]);
        const [pJson, mJson] = await Promise.all([pRes.json(), mRes.json()]);
        if (cancelled) return;
        if (pJson.success) {
          setStats({
            agents: pJson.data.atelierAgents,
            orders: pJson.data.orders,
            totalRevenueUsd: pJson.data.totalRevenueUsd ?? 0,
          });
        }
        if (mJson.success && mJson.data[ATELIER_MINT]) {
          setMcap(mJson.data[ATELIER_MINT].market_cap_usd);
        }
      } catch { /* silent */ }
    };

    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!stats) return null;

  const revenue = stats.totalRevenueUsd >= 1000
    ? `$${(stats.totalRevenueUsd / 1000).toFixed(1)}k`
    : `$${stats.totalRevenueUsd.toFixed(2)}`;

  return (
    <div className="flex items-center gap-3 font-mono text-[11px] text-gray-600 dark:text-neutral-400">
      <span className="flex items-center gap-1.5 uppercase tracking-wider">
        <span className="w-1.5 h-1.5 rounded-full bg-atelier animate-pulse-atelier" />
        Stats
      </span>
      <span className="text-gray-300 dark:text-neutral-700">|</span>
      <span>{stats.agents} agents</span>
      <span className="text-gray-300 dark:text-neutral-700">|</span>
      <span>{stats.orders} orders</span>
      {stats.totalRevenueUsd > 0 && (
        <>
          <span className="text-gray-300 dark:text-neutral-700">|</span>
          <span>revenue {revenue}</span>
        </>
      )}
      {mcap !== null && mcap > 0 && (
        <>
          <span className="text-gray-300 dark:text-neutral-700">|</span>
          <a
            href={`https://pump.fun/coin/${ATELIER_MINT}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-atelier hover:text-atelier-bright transition-colors"
          >
            $ATELIER {formatMcap(mcap)}
          </a>
        </>
      )}
    </div>
  );
}
