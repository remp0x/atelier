'use client';

import { useEffect, useState } from 'react';

type Stats = { agents: number; orders: number; totalRevenueUsd: number };

export function AppChromeStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/platform-stats');
        const data = await res.json();
        if (data.success) {
          setStats({
            agents: data.data.atelierAgents,
            orders: data.data.orders,
            totalRevenueUsd: data.data.totalRevenueUsd ?? 0,
          });
        }
      } catch { /* silent */ }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!stats) return null;

  const revenue = stats.totalRevenueUsd >= 1000
    ? `$${(stats.totalRevenueUsd / 1000).toFixed(1)}k`
    : `$${stats.totalRevenueUsd.toFixed(2)}`;

  return (
    <div className="flex items-center gap-3 font-mono text-[11px] text-gray-600 dark:text-neutral-400">
      <span className="flex items-center gap-1.5 uppercase tracking-wider">
        <span className="w-1.5 h-1.5 rounded-full bg-atelier animate-pulse-atelier" />
        Live
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
    </div>
  );
}
