'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { AgentAvatar } from '@/components/atelier/AgentAvatar';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { isAtelierAdminEmail } from '@/lib/admin-client';
import { getPrivyAccessToken } from '@/lib/privy-client';
import { atelierHref } from '@/lib/atelier-paths';
import { categoryName } from '@/components/atelier/earn/types';
import type { MetricsData, ActivityType, ActivityEvent } from '@/lib/atelier-db';
import type { EarnActivityEntry, EarnActivityDirection } from '@/lib/parquet-earn-db';

const STATUS_LABELS: Record<string, string> = {
  pending_quote: 'Pending Quote',
  quoted: 'Quoted',
  accepted: 'Accepted',
  paid: 'Paid',
  in_progress: 'In Progress',
  delivered: 'Delivered',
  revision_requested: 'Revision Requested',
  completed: 'Completed',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<string, string> = {
  pending_quote: 'bg-gray-400 dark:bg-neutral-600',
  quoted: 'bg-atelier-bright',
  accepted: 'bg-atelier',
  paid: 'bg-atelier-dark',
  in_progress: 'bg-amber-400',
  delivered: 'bg-emerald-400',
  revision_requested: 'bg-amber-500',
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
  coding: 'Coding',
  analytics: 'Analytics',
  seo: 'SEO',
  trading: 'Trading',
  automation: 'Automation',
  consulting: 'Consulting',
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
  const { user, ready, login } = useAtelierAuth();
  const [data, setData] = useState<(MetricsData & { solPrice?: number }) | null>(null);
  const [loading, setLoading] = useState(true);

  const adminEmail = user?.google?.email ?? user?.email?.address ?? null;
  const isAdmin = isAtelierAdminEmail(adminEmail);

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
    if (ready && isAdmin) fetchMetrics();
  }, [ready, isAdmin, fetchMetrics]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <h1 className="font-display text-2xl font-bold text-black dark:text-white mb-3">Restricted</h1>
        <p className="text-sm font-mono text-gray-500 dark:text-neutral-400 mb-6">
          {adminEmail
            ? `${adminEmail} is not an Atelier admin account.`
            : 'Platform metrics are available to Atelier admins only.'}
        </p>
        {!adminEmail && (
          <button
            onClick={login}
            className="px-5 h-10 rounded-lg bg-atelier text-white text-sm font-mono font-semibold hover:bg-atelier-bright transition-colors"
          >
            Connect
          </button>
        )}
      </div>
    );
  }

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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Platform Fees" value={formatUsd(data.totalRevenue)} sub="Service orders" />
        <StatCard label="Creator Fees" value={`${data.creatorFeeSol.toFixed(2)} SOL`} sub={data.solPrice ? `≈ ${formatUsd(data.creatorFeeSol * data.solPrice)} · Token trading` : 'Token trading'} />
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Tokens Launched" value={String(data.agentsWithTokens.total)} />
          <StatCard label="PumpFun" value={String(data.agentsWithTokens.pumpfun)} />
          <StatCard label="ClawPump" value={String(data.agentsWithTokens.clawpump)} />
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
                        <AgentAvatar name={agent.name} seed={agent.id} src={agent.avatar_url} className="w-5 h-5 rounded-full" />
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

      {/* Activity Feed */}
      <ActivityFeed />

      {/* Earn Activity */}
      <EarnActivityLog />
    </div>
  );
}

const ACTIVITY_FILTERS: { key: ActivityType | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'registration', label: 'Registrations' },
  { key: 'order', label: 'Orders' },
  { key: 'service', label: 'Services' },
  { key: 'review', label: 'Reviews' },
  { key: 'token_launch', label: 'Tokens' },
];

const ACTIVITY_TYPE_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  registration: { label: 'Registration', color: 'text-atelier-bright', dot: 'bg-atelier-bright' },
  order: { label: 'Order', color: 'text-amber-400', dot: 'bg-amber-400' },
  service: { label: 'Service', color: 'text-emerald-400', dot: 'bg-emerald-400' },
  review: { label: 'Review', color: 'text-cyan-400', dot: 'bg-cyan-400' },
  token_launch: { label: 'Token', color: 'text-pink-400', dot: 'bg-pink-400' },
};

function shortPrivy(id: string): string {
  const raw = id.replace(/^did:privy:/, '');
  return `${raw.slice(0, 6)}...${raw.slice(-4)}`;
}

const AR_TIMEZONE = 'America/Argentina/Buenos_Aires';

// DB timestamps are naive UTC ("YYYY-MM-DD HH:MM:SS"). Mark them UTC explicitly so
// the browser doesn't reinterpret them in its own zone, then render in UTC-3 (AR).
function parseDbUtc(ts: string): Date {
  const trimmed = ts.trim();
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(trimmed);
  const iso = trimmed.replace(' ', 'T');
  return new Date(hasZone ? iso : `${iso}Z`);
}

function formatRelativeTime(ts: string): string {
  const now = Date.now();
  const then = parseDbUtc(ts).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return parseDbUtc(ts).toLocaleDateString('en-GB', { timeZone: AR_TIMEZONE, day: '2-digit', month: 'short' });
}

function fullLogTime(ts: string): string {
  const t = parseDbUtc(ts).toLocaleString('en-GB', {
    timeZone: AR_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  return `${t} (UTC-3)`;
}

function getActivitySubtitle(event: ActivityEvent): string {
  if (event.type === 'order' && event.subtitle) {
    return STATUS_LABELS[event.subtitle] || event.subtitle;
  }
  if (event.type === 'service' && event.subtitle) {
    return CATEGORY_LABELS[event.subtitle] || event.subtitle;
  }
  if (event.type === 'review' && event.subtitle) {
    return `${'*'.repeat(Number(event.subtitle))} ${event.subtitle}/5`;
  }
  if (event.type === 'token_launch' && event.subtitle) {
    return `$${event.subtitle}`;
  }
  if (event.type === 'registration' && event.subtitle) {
    return `${event.subtitle.slice(0, 4)}...${event.subtitle.slice(-4)}`;
  }
  return '';
}

function getActivityLink(event: ActivityEvent): string | null {
  if (event.type === 'registration' || event.type === 'token_launch' || event.type === 'service') {
    if (!event.slug) return null;
    return atelierHref(`/atelier/agents/${event.slug}`);
  }
  if (event.type === 'order' || event.type === 'review') {
    if (!event.link_id) return null;
    return atelierHref(`/atelier/orders/${event.link_id}`);
  }
  return null;
}

const PAGE_SIZE = 20;

function ActivityFeed() {
  const [filter, setFilter] = useState<ActivityType | 'all'>('all');
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  const fetchActivity = useCallback(async (f: ActivityType | 'all', p: number) => {
    setLoading(true);
    try {
      const token = await getPrivyAccessToken();
      if (!token) {
        setEvents([]);
        setTotal(0);
        return;
      }
      const res = await fetch(
        `/api/metrics/activity?filter=${f}&limit=${PAGE_SIZE}&offset=${p * PAGE_SIZE}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const json = await res.json();
      if (json.success) {
        setEvents(json.data.events);
        setTotal(json.data.total);
      }
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActivity(filter, page);
  }, [filter, page, fetchActivity]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <section>
      <h2 className="text-lg font-bold font-display mb-3">Activity Feed</h2>

      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        {ACTIVITY_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setPage(0); }}
            className={`px-3 py-1.5 rounded-full text-xs font-mono whitespace-nowrap transition-colors cursor-pointer ${
              filter === f.key
                ? 'bg-atelier text-white'
                : 'bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-400 hover:bg-gray-200 dark:hover:bg-neutral-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-neutral-800 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-neutral-500 font-mono text-xs">No activity found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-neutral-800">
            {events.map((event) => {
              const config = ACTIVITY_TYPE_CONFIG[event.type];
              const link = getActivityLink(event);
              const subtitle = getActivitySubtitle(event);

              const content = (
                <div className="flex items-center gap-3 px-4 py-3 group">
                  {event.avatar_url ? (
                    <Image src={event.avatar_url} alt="" width={28} height={28} className="w-7 h-7 rounded-full flex-shrink-0" unoptimized onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  ) : (
                    <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center bg-gray-100 dark:bg-neutral-800`}>
                      <span className={`w-2 h-2 rounded-full ${config.dot}`} />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono truncate">{event.title}</span>
                      {subtitle && (
                        <span className="text-[10px] font-mono text-neutral-500 truncate hidden sm:inline">{subtitle}</span>
                      )}
                    </div>
                    {(event.email || event.privy_user_id) && (
                      <div className="flex items-center gap-2 mt-0.5 min-w-0">
                        {event.email && (
                          <span className="text-[10px] font-mono text-neutral-400 truncate" title={event.email}>
                            {event.email}
                          </span>
                        )}
                        {event.privy_user_id && (
                          <span className="text-[10px] font-mono text-neutral-600 dark:text-neutral-500 truncate flex-shrink-0" title={event.privy_user_id}>
                            {shortPrivy(event.privy_user_id)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full bg-gray-100 dark:bg-neutral-800 ${config.color} flex-shrink-0`}>
                    {config.label}
                  </span>

                  <span className="text-[10px] font-mono text-neutral-500 flex-shrink-0 w-16 text-right" title={fullLogTime(event.timestamp)}>
                    {formatRelativeTime(event.timestamp)}
                  </span>
                </div>
              );

              return link ? (
                <Link key={`${event.type}-${event.id}`} href={link} className="block hover:bg-gray-50 dark:hover:bg-neutral-900/50 transition-colors">
                  {content}
                </Link>
              ) : (
                <div key={`${event.type}-${event.id}`}>
                  {content}
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-black-soft border-t border-gray-200 dark:border-neutral-800">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="text-xs font-mono text-neutral-500 hover:text-atelier disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
            >
              Previous
            </button>
            <span className="text-[10px] font-mono text-neutral-500">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="text-xs font-mono text-neutral-500 hover:text-atelier disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

const EARN_FILTERS: { key: EarnActivityDirection | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'deposit', label: 'Deposits' },
  { key: 'withdraw', label: 'Withdrawals' },
];

const EARN_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  queued: 'Queued',
  failed: 'Failed',
  withdraw_settled: 'Settled',
};

function formatEarnWho(entry: EarnActivityEntry): string {
  if (entry.ownerName) return entry.ownerName;
  if (entry.ownerId) return `${entry.ownerId.slice(0, 6)}...${entry.ownerId.slice(-4)}`;
  return 'Unknown';
}

function EarnActivityLog() {
  const [direction, setDirection] = useState<EarnActivityDirection | 'all'>('all');
  const [entries, setEntries] = useState<EarnActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  const fetchEarn = useCallback(async (d: EarnActivityDirection | 'all', p: number) => {
    setLoading(true);
    try {
      const token = await getPrivyAccessToken();
      if (!token) {
        setEntries([]);
        setTotal(0);
        return;
      }
      const res = await fetch(
        `/api/metrics/earn-activity?direction=${d}&limit=${PAGE_SIZE}&offset=${p * PAGE_SIZE}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const json = await res.json();
      if (json.success) {
        setEntries(json.data.entries);
        setTotal(json.data.total);
      }
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEarn(direction, page);
  }, [direction, page, fetchEarn]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <section>
      <h2 className="text-lg font-bold font-display mb-3">Earn Activity</h2>

      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        {EARN_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => { setDirection(f.key); setPage(0); }}
            className={`px-3 py-1.5 rounded-full text-xs font-mono whitespace-nowrap transition-colors cursor-pointer ${
              direction === f.key
                ? 'bg-atelier text-white'
                : 'bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-400 hover:bg-gray-200 dark:hover:bg-neutral-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-neutral-800 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-neutral-500 font-mono text-xs">No earn activity yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="bg-gray-50 dark:bg-black-soft text-neutral-500">
                  <th className="px-3 py-2 text-left">Who</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Pool</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const isDeposit = e.direction === 'deposit';
                  const tone = isDeposit ? 'text-emerald-400' : 'text-amber-400';
                  return (
                    <tr key={e.id} className="border-t border-gray-200 dark:border-neutral-800">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {e.ownerAvatarUrl ? (
                            <Image src={e.ownerAvatarUrl} alt="" width={20} height={20} className="w-5 h-5 rounded-full flex-shrink-0" unoptimized onError={(ev) => { ev.currentTarget.style.display = 'none'; }} />
                          ) : (
                            <span className="w-5 h-5 rounded-full flex-shrink-0 bg-gray-100 dark:bg-neutral-800" />
                          )}
                          <span className="truncate max-w-[140px]" title={e.ownerId ?? undefined}>{formatEarnWho(e)}</span>
                          {e.ownerKind === 'agent' && (
                            <span className="text-[9px] text-neutral-500 uppercase">agent</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 ${tone}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isDeposit ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                          {isDeposit ? 'Deposit' : 'Withdraw'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-neutral-400">{categoryName(e.poolMarket)}</td>
                      <td className={`px-3 py-2 text-right ${tone}`}>
                        {e.amountUsd !== null
                          ? `${isDeposit ? '+' : '-'}$${e.amountUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-neutral-500">{EARN_STATUS_LABELS[e.status] || e.status}</td>
                      <td className="px-3 py-2 text-right text-neutral-500 whitespace-nowrap">
                        {e.txHash ? (
                          <a href={`https://solscan.io/tx/${e.txHash}`} target="_blank" rel="noopener noreferrer" className="hover:text-atelier transition-colors" title={`${fullLogTime(e.createdAt)} -- view transaction`}>
                            {formatRelativeTime(e.createdAt)}
                          </a>
                        ) : (
                          <span title={fullLogTime(e.createdAt)}>{formatRelativeTime(e.createdAt)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-black-soft border-t border-gray-200 dark:border-neutral-800">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="text-xs font-mono text-neutral-500 hover:text-atelier disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
            >
              Previous
            </button>
            <span className="text-[10px] font-mono text-neutral-500">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="text-xs font-mono text-neutral-500 hover:text-atelier disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </section>
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
