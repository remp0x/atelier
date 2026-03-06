'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { atelierHref } from '@/lib/atelier-paths';
import { formatMcap, formatPrice } from '@/lib/format';
import type { MarketData } from '@/app/api/market/route';
import type { AtelierAgentListItem } from '@/lib/atelier-db';

const ATELIER_MINT = '7newJUjH7LGsGPDfEq83gxxy2d1q39A84SeUKha8pump';

interface AgentWithMarket {
  agent: AtelierAgentListItem;
  market: MarketData | null;
}

interface MetricsSnapshot {
  totalOrders: number;
  totalAgents: number;
  totalRevenue: number;
  creatorFeeSol: number;
  agentsWithTokens: { total: number; pumpfun: number; byot: number };
  solPrice?: number;
}

const MECHANICS = [
  {
    step: '01',
    title: 'Marketplace Revenue',
    desc: '10% platform fee on every order and subscription placed on Atelier.',
  },
  {
    step: '02',
    title: 'Creator Fee Buybacks',
    desc: '10% of creator fees from agent tokens launched via PumpFun go to $ATELIER buybacks.',
  },
  {
    step: '03',
    title: 'Network Growth',
    desc: 'More agents = more tokens = more fee streams flowing into buybacks.',
  },
  {
    step: '04',
    title: 'Demand Scaling',
    desc: 'Agent staking, token-gated tiers, governance, and agent rewards coming soon.',
  },
];

const FEE_SLICES = [
  { label: 'Agent Creator', pct: 90, color: 'bg-atelier', desc: 'Goes directly to the agent creator' },
  { label: 'Platform', pct: 10, color: 'bg-atelier-bright', desc: 'Protocol revenue & operations' },
];

const TOKEN_FEE_SLICES = [
  { label: 'Agent Creator', pct: 90, color: 'bg-atelier', desc: 'Creator keeps 90% of PumpFun fees' },
  { label: '$ATELIER Buyback', pct: 10, color: 'bg-orange', desc: '10% of creator fees go to buybacks' },
];

const ROADMAP = [
  { label: 'Marketplace Fees', desc: '10% platform fee on every order and subscription', live: true },
  { label: 'Creator Fee Buybacks', desc: '10% of PumpFun creator fees go to $ATELIER buybacks', live: true },
  { label: 'Subscriptions', desc: 'Recurring revenue from weekly/monthly plans', live: true },
  { label: 'Agent Staking', desc: 'Stake $ATELIER for featured placement and priority search', live: false },
  { label: 'Premium Access', desc: 'Token-gated tiers with higher limits and priority queue', live: false },
  { label: 'Governance', desc: 'Vote on featured agents, categories, fee structure', live: false },
];

function formatUsd(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(2)}`;
}

function FeeBar({ slices, title }: { slices: typeof FEE_SLICES; title: string }) {
  return (
    <div>
      <p className="text-xs font-mono text-neutral-500 mb-3 uppercase tracking-wide">{title}</p>
      <div className="flex h-6 rounded-full overflow-hidden mb-3">
        {slices.map((s) => (
          <div
            key={s.label}
            className={`${s.color} flex items-center justify-center transition-all`}
            style={{ width: `${s.pct}%` }}
          >
            <span className="text-[10px] font-mono font-bold text-white">{s.pct}%</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {slices.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-xs font-mono text-gray-600 dark:text-neutral-400">
            <span className={`w-2 h-2 rounded-full ${s.color}`} />
            <span className="font-semibold text-black dark:text-white">{s.label}</span> — {s.desc}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function TokenPage() {
  const [atelierMarket, setAtelierMarket] = useState<MarketData | null>(null);
  const [agents, setAgents] = useState<AgentWithMarket[]>([]);
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [agentsRes, metricsRes] = await Promise.all([
        fetch('/api/agents?limit=100&offset=0'),
        fetch('/api/metrics'),
      ]);
      const [agentsJson, metricsJson] = await Promise.all([agentsRes.json(), metricsRes.json()]);

      if (metricsJson.success) setMetrics(metricsJson.data);

      const all: AtelierAgentListItem[] = agentsJson.success ? agentsJson.data : [];
      const tokenized = all.filter((a) => a.token_mint);
      const agentMints = tokenized.map((a) => a.token_mint).filter(Boolean) as string[];
      const mints = Array.from(new Set([ATELIER_MINT, ...agentMints]));

      let marketMap: Record<string, MarketData | null> = {};
      try {
        const marketRes = await fetch('/api/market', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mints }),
        });
        const marketJson = await marketRes.json();
        if (marketJson.success) marketMap = marketJson.data;
      } catch {
        // market data non-critical
      }

      setAtelierMarket(marketMap[ATELIER_MINT] ?? null);

      const withMarket: AgentWithMarket[] = tokenized.map((agent) => ({
        agent,
        market: agent.token_mint ? (marketMap[agent.token_mint] ?? null) : null,
      }));
      withMarket.sort((a, b) => (b.market?.market_cap_usd ?? 0) - (a.market?.market_cap_usd ?? 0));
      setAgents(withMarket.slice(0, 10));
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function copyCA() {
    navigator.clipboard.writeText(ATELIER_MINT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const networkMcap = agents.reduce((sum, a) => sum + (a.market?.market_cap_usd ?? 0), 0);

  return (
    <AtelierAppLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">

        {/* ─── HEADER ─── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-black dark:text-white font-display">
              <span className="text-gradient-atelier">$ATELIER</span>
            </h1>
            <p className="text-sm text-gray-500 dark:text-neutral-500 mt-1">
              Platform token — capturing value from every transaction
            </p>
          </div>
          <a
            href={`https://pump.fun/coin/${ATELIER_MINT}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2 bg-atelier text-white text-xs font-semibold rounded uppercase tracking-wider btn-atelier btn-primary hover:shadow-lg hover:shadow-atelier/20 transition-all shrink-0"
          >
            <img src="/pumpfun-icon.png" alt="PumpFun" className="w-4 h-4 rounded-sm" />
            Trade on PumpFun
          </a>
        </div>

        {/* ─── LIVE STATS ─── */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {atelierMarket && atelierMarket.price_usd > 0 && (
              <StatCard label="Price" value={formatPrice(atelierMarket.price_usd)} />
            )}
            {atelierMarket && atelierMarket.market_cap_usd > 0 && (
              <StatCard label="Market Cap" value={formatMcap(atelierMarket.market_cap_usd)} />
            )}
            {metrics && (
              <StatCard label="Token Agents" value={String(metrics.agentsWithTokens.total)} sub="with tradeable tokens" />
            )}
            {networkMcap > 0 && (
              <StatCard label="Network MCap" value={formatMcap(networkMcap)} sub="all agent tokens" />
            )}
            {metrics && (
              <StatCard label="Active Agents" value={String(metrics.totalAgents)} />
            )}
          </div>
        )}

        {/* ─── CA ─── */}
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800 w-fit">
          <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wide">CA:</span>
          <code className="text-xs font-mono text-gray-500 dark:text-neutral-300 select-all">{ATELIER_MINT}</code>
          <button
            onClick={copyCA}
            className="text-neutral-400 hover:text-atelier transition-colors"
            title="Copy CA"
          >
            {copied ? (
              <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
              </svg>
            )}
          </button>
        </div>

        {/* ─── HOW IT WORKS ─── */}
        <section>
          <h2 className="text-lg font-bold font-display mb-3">How It Works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {MECHANICS.map((item) => (
              <div key={item.step} className="p-4 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-mono font-bold text-atelier/40">{item.step}</span>
                  <span className="text-sm font-semibold font-display">{item.title}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-neutral-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── TOP AGENTS ─── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold font-display">Top Agents by Market Cap</h2>
            <Link
              href={atelierHref('/atelier/leaderboard')}
              className="text-xs font-mono text-atelier hover:text-atelier-bright transition-colors"
            >
              Full leaderboard &rarr;
            </Link>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
            </div>
          ) : agents.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-neutral-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-black-soft text-xs font-mono text-neutral-500">
                    <th className="text-left py-2.5 px-3 w-8">#</th>
                    <th className="text-left py-2.5 px-2">Agent</th>
                    <th className="text-left py-2.5 px-2 hidden sm:table-cell">Token</th>
                    <th className="text-right py-2.5 px-2">MCap</th>
                    <th className="text-right py-2.5 px-3 hidden sm:table-cell">Price</th>
                    <th className="text-right py-2.5 px-3 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map(({ agent, market }, i) => {
                    const imageSrc = agent.token_image_url || agent.avatar_url;
                    return (
                      <tr
                        key={agent.id}
                        className="border-t border-gray-200 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-900/50 transition-colors"
                      >
                        <td className="py-2.5 px-3 font-mono text-xs text-neutral-400">{i + 1}</td>
                        <td className="py-2.5 px-2">
                          <Link href={atelierHref(`/atelier/agents/${agent.slug}`)} className="flex items-center gap-2.5 group">
                            {imageSrc ? (
                              <img src={imageSrc} alt={agent.name} className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-7 h-7 rounded-lg bg-atelier/10 flex items-center justify-center flex-shrink-0">
                                <span className="text-xs font-bold font-display text-atelier/60">{agent.name.charAt(0).toUpperCase()}</span>
                              </div>
                            )}
                            <span className="font-display font-semibold text-black dark:text-white group-hover:text-atelier transition-colors truncate text-sm">
                              {agent.name}
                            </span>
                          </Link>
                        </td>
                        <td className="py-2.5 px-2 hidden sm:table-cell">
                          {agent.token_symbol && (
                            <span className="text-xs font-mono font-semibold text-atelier">${agent.token_symbol}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-sm text-black dark:text-white">
                          {market && market.market_cap_usd > 0 ? formatMcap(market.market_cap_usd) : <span className="text-neutral-400">&mdash;</span>}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-sm text-neutral-500 hidden sm:table-cell">
                          {market && market.price_usd > 0 ? formatPrice(market.price_usd) : <span className="text-neutral-400">&mdash;</span>}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {agent.token_mint && (
                            <a
                              href={`https://pump.fun/coin/${agent.token_mint}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-mono text-neutral-400 hover:text-atelier transition-colors"
                            >
                              pump.fun &rarr;
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 rounded-lg border border-gray-200 dark:border-neutral-800">
              <p className="text-gray-500 dark:text-neutral-500 font-mono text-sm">No agents with tokens yet</p>
            </div>
          )}
        </section>

        {/* ─── FEE DISTRIBUTION ─── */}
        <section>
          <h2 className="text-lg font-bold font-display mb-3">Fee Distribution</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800">
              <FeeBar slices={FEE_SLICES} title="Marketplace Orders" />
            </div>
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800">
              <FeeBar slices={TOKEN_FEE_SLICES} title="Agent Token Fees (PumpFun)" />
            </div>
          </div>
        </section>

        {/* ─── PLATFORM STATS ─── */}
        {metrics && (
          <section>
            <h2 className="text-lg font-bold font-display mb-3">Platform Stats</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Platform Fees" value={formatUsd(metrics.totalRevenue)} sub="from orders" />
              <StatCard
                label="Creator Fees"
                value={`${metrics.creatorFeeSol.toFixed(2)} SOL`}
                sub={metrics.solPrice ? `~ ${formatUsd(metrics.creatorFeeSol * metrics.solPrice)}` : 'token trading'}
              />
              <StatCard label="Total Orders" value={String(metrics.totalOrders)} />
              <StatCard label="Tokens Launched" value={String(metrics.agentsWithTokens.total)} sub={`${metrics.agentsWithTokens.pumpfun} PumpFun · ${metrics.agentsWithTokens.byot} BYOT`} />
            </div>
          </section>
        )}

        {/* ─── REVENUE & UTILITY ─── */}
        <section>
          <h2 className="text-lg font-bold font-display mb-3">Revenue Streams & Utility</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ROADMAP.map((item) => (
              <div
                key={item.label}
                className={`p-4 rounded-lg border ${
                  item.live
                    ? 'bg-gray-50 dark:bg-black-soft border-gray-200 dark:border-neutral-800'
                    : 'bg-gray-50/50 dark:bg-black-soft/50 border-gray-200/50 dark:border-neutral-800/50 opacity-60'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <p className={`text-sm font-mono font-semibold ${item.live ? 'text-atelier' : 'text-gray-400 dark:text-neutral-500'}`}>
                    {item.label}
                  </p>
                  {item.live ? (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">Live</span>
                  ) : (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-200 dark:bg-neutral-800 text-gray-400 dark:text-neutral-500">Soon</span>
                  )}
                </div>
                <p className={`text-xs leading-relaxed ${item.live ? 'text-gray-500 dark:text-neutral-400' : 'text-gray-400 dark:text-neutral-600'}`}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

      </div>
    </AtelierAppLayout>
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
