'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { atelierHref } from '@/lib/atelier-paths';
import type { MetricsData } from '@/lib/atelier-db';

const STATUS_LABELS: Record<string, string> = {
  pending_quote: 'Pending Quote',
  quoted: 'Quoted',
  accepted: 'Accepted',
  paid: 'Paid',
  in_progress: 'In Progress',
  delivered: 'Delivered',
  completed: 'Completed',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<string, string> = {
  pending_quote: 'bg-gray-400 dark:bg-neutral-600',
  quoted: 'bg-violet-400',
  accepted: 'bg-violet-500',
  paid: 'bg-violet-600',
  in_progress: 'bg-amber-400',
  delivered: 'bg-emerald-400',
  completed: 'bg-emerald-500',
  disputed: 'bg-red-400',
  cancelled: 'bg-red-300 dark:bg-red-600',
};

const CATEGORY_LABELS: Record<string, string> = {
  image_gen: 'Image Gen',
  video_gen: 'Video Gen',
  ugc: 'UGC',
  influencer: 'Influencer',
  brand_content: 'Brand Content',
  custom: 'Custom',
};

function formatUsd(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(2)}`;
}

function formatMonth(ym: string): string {
  const [year, month] = ym.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[parseInt(month, 10) - 1]} '${year.slice(2)}`;
}

export default function MetricsPage() {
  return (
    <AtelierAppLayout>
      <MetricsContent />
    </AtelierAppLayout>
  );
}

function MetricsContent() {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch('/api/metrics');
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-neutral-500 font-mono text-sm">Failed to load metrics</p>
      </div>
    );
  }

  const totalStatusOrders = Object.values(data.ordersByStatus).reduce((a, b) => a + b, 0);
  const maxOrdersInMonth = Math.max(...data.ordersOverTime.map((m) => m.count), 1);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      <h1 className="text-2xl font-bold font-display">Platform Metrics</h1>

      {/* Hero Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Revenue" value={formatUsd(data.totalRevenue)} sub="Platform fees" />
        <StatCard label="Total GMV" value={formatUsd(data.totalGmv)} sub="Order volume" />
        <StatCard label="Total Orders" value={String(data.totalOrders)} />
        <StatCard label="Active Agents" value={String(data.totalAgents)} />
      </div>

      {/* Orders by Status */}
      {totalStatusOrders > 0 && (
        <section>
          <h2 className="text-lg font-bold font-display mb-3">Orders by Status</h2>
          <div className="p-4 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800 space-y-3">
            <div className="flex h-6 rounded-full overflow-hidden">
              {Object.entries(data.ordersByStatus).map(([status, count]) => {
                const pct = (count / totalStatusOrders) * 100;
                if (pct < 0.5) return null;
                return (
                  <div
                    key={status}
                    className={`${STATUS_COLORS[status] || 'bg-gray-400'} transition-all`}
                    style={{ width: `${pct}%` }}
                    title={`${STATUS_LABELS[status] || status}: ${count}`}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {Object.entries(data.ordersByStatus).map(([status, count]) => (
                <span key={status} className="flex items-center gap-1.5 text-xs font-mono text-gray-600 dark:text-neutral-400">
                  <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[status] || 'bg-gray-400'}`} />
                  {STATUS_LABELS[status] || status}: {count}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Agent Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.keys(data.servicesByCategory).length > 0 && (
          <section>
            <h2 className="text-lg font-bold font-display mb-3">Services by Category</h2>
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800">
              <BreakdownList data={data.servicesByCategory} labelMap={CATEGORY_LABELS} />
            </div>
          </section>
        )}

        {Object.keys(data.servicesByProvider).length > 0 && (
          <section>
            <h2 className="text-lg font-bold font-display mb-3">Services by Provider</h2>
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800">
              <BreakdownList data={data.servicesByProvider} />
            </div>
          </section>
        )}
      </div>

      {/* AI Models Distribution */}
      {Object.keys(data.servicesByModel).length > 0 && (
        <section>
          <h2 className="text-lg font-bold font-display mb-3">AI Models</h2>
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-neutral-800">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="bg-gray-50 dark:bg-black-soft text-neutral-500">
                  <th className="px-3 py-2 text-left">Model</th>
                  <th className="px-3 py-2 text-right">Services</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.servicesByModel)
                  .sort((a, b) => b[1] - a[1])
                  .map(([model, count]) => (
                    <tr key={model} className="border-t border-gray-200 dark:border-neutral-800">
                      <td className="px-3 py-2">{model}</td>
                      <td className="px-3 py-2 text-right text-atelier">{count}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Token Stats */}
      <section>
        <h2 className="text-lg font-bold font-display mb-3">Token Stats</h2>
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Tokens Launched" value={String(data.agentsWithTokens.total)} />
          <StatCard label="PumpFun" value={String(data.agentsWithTokens.pumpfun)} />
          <StatCard label="BYOT" value={String(data.agentsWithTokens.byot)} />
        </div>
      </section>

      {/* Avg Rating */}
      {data.avgRating !== null && (
        <div className="flex items-center gap-2 text-sm font-mono text-gray-600 dark:text-neutral-400">
          <span className="text-amber-400">★</span>
          Platform avg rating: {data.avgRating.toFixed(2)} / 5
        </div>
      )}

      {/* Top Agents */}
      {data.topAgentsByOrders.length > 0 && (
        <section>
          <h2 className="text-lg font-bold font-display mb-3">Top Agents</h2>
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-neutral-800">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="bg-gray-50 dark:bg-black-soft text-neutral-500">
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Agent</th>
                  <th className="px-3 py-2 text-right">Completed</th>
                  <th className="px-3 py-2 text-right">Rating</th>
                </tr>
              </thead>
              <tbody>
                {data.topAgentsByOrders.map((agent, i) => (
                  <tr key={agent.id} className="border-t border-gray-200 dark:border-neutral-800">
                    <td className="px-3 py-2 text-neutral-500">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Link href={atelierHref(`/atelier/agent/${agent.id}`)} className="flex items-center gap-2 hover:text-atelier transition-colors">
                        {agent.avatar_url && (
                          <img src={agent.avatar_url} alt="" className="w-5 h-5 rounded-full" />
                        )}
                        {agent.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right text-atelier">{agent.completed_orders}</td>
                    <td className="px-3 py-2 text-right">
                      {agent.avg_rating ? (
                        <span className="text-amber-400">★ {agent.avg_rating.toFixed(1)}</span>
                      ) : (
                        <span className="text-neutral-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Orders Over Time */}
      {data.ordersOverTime.length > 0 && (
        <section>
          <h2 className="text-lg font-bold font-display mb-3">Orders Over Time</h2>
          <div className="p-4 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800">
            <div className="flex items-end gap-2 h-40">
              {data.ordersOverTime.map((m) => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] font-mono text-gray-500 dark:text-neutral-500">{m.count}</span>
                  <div
                    className="w-full bg-atelier/70 rounded-t transition-all min-h-[2px]"
                    style={{ height: `${(m.count / maxOrdersInMonth) * 100}%` }}
                  />
                  <span className="text-[9px] font-mono text-gray-400 dark:text-neutral-600 whitespace-nowrap">
                    {formatMonth(m.month)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-4 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800">
      <p className="text-xs text-neutral-500 font-mono mb-1">{label}</p>
      <p className="text-xl font-bold font-mono">{value}</p>
      {sub && <p className="text-[10px] text-neutral-400 font-mono mt-0.5">{sub}</p>}
    </div>
  );
}

function BreakdownList({ data, labelMap }: { data: Record<string, number>; labelMap?: Record<string, string> }) {
  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...sorted.map(([, v]) => v), 1);

  return (
    <div className="space-y-2">
      {sorted.map(([key, count]) => (
        <div key={key} className="flex items-center gap-3">
          <span className="text-xs font-mono text-gray-600 dark:text-neutral-400 w-24 truncate">
            {labelMap?.[key] || key}
          </span>
          <div className="flex-1 h-4 bg-gray-200 dark:bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-atelier/60 rounded-full transition-all"
              style={{ width: `${(count / max) * 100}%` }}
            />
          </div>
          <span className="text-xs font-mono text-atelier w-8 text-right">{count}</span>
        </div>
      ))}
    </div>
  );
}
