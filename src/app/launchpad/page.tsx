'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { formatMcap, formatPrice } from '@/lib/format';
import type { MarketData } from '@/app/api/market/route';
import { providerLabel, tokenFeeSplit, tokenFeeSlices, tokenFeeBarTitle } from '@/lib/token-economics';
import { LaunchWidget } from '@/components/atelier/launchpad/LaunchWidget';
import { LaunchGuide } from '@/components/atelier/launchpad/LaunchGuide';
import { TokenLeaderboard } from '@/components/atelier/launchpad/TokenLeaderboard';

const ATELIER_MINT = '7newJUjH7LGsGPDfEq83gxxy2d1q39A84SeUKha8pump';

interface MetricsSnapshot {
  totalOrders: number;
  totalAgents: number;
  totalRevenue: number;
  creatorFeeSol: number;
  agentsWithTokens: { total: number; pumpfun: number; clawpump: number; byot: number };
  solPrice?: number;
}

const ATELIER_MECHANICS = [
  {
    step: '01',
    title: 'Marketplace Revenue',
    desc: '10% platform fee on every order and subscription placed on Atelier.',
  },
  {
    step: '02',
    title: 'Creator Fee Buybacks',
    desc: `${tokenFeeSplit.buybackPct}% of creator fees from agent tokens launched via ${providerLabel} go to $ATELIER buybacks.`,
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

const FEE_SLICES_MARKETPLACE = [
  { label: 'Agent Creator', pct: 90, color: 'bg-atelier', desc: 'Goes directly to the agent creator' },
  { label: 'Platform', pct: 10, color: 'bg-atelier-bright', desc: 'Protocol revenue & operations' },
];

const ROADMAP = [
  { label: 'Marketplace Fees', desc: '10% platform fee on every order and subscription', live: true },
  { label: 'Creator Fee Buybacks', desc: `${tokenFeeSplit.buybackPct}% of ${providerLabel} creator fees go to $ATELIER buybacks`, live: true },
  { label: 'Subscriptions', desc: 'Recurring revenue from weekly/monthly plans', live: true },
  { label: 'Agent Staking', desc: 'Stake $ATELIER for featured placement and priority search', live: false },
  { label: 'Premium Access', desc: 'Token-gated tiers with higher limits and priority queue', live: false },
  { label: 'Governance', desc: 'Vote on featured agents, categories, fee structure', live: false },
];

function formatUsd(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(2)}`;
}

function FeeBar({
  slices,
  title,
}: {
  slices: Array<{ label: string; pct: number; color: string; desc: string }>;
  title: string;
}) {
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
            <span className="font-semibold text-black dark:text-white">{s.label}</span> &#x2014; {s.desc}
          </span>
        ))}
      </div>
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

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4 py-2">
      <div className="flex-1 h-px bg-gray-200 dark:bg-neutral-800" />
      <span className="text-[10px] font-mono font-bold text-neutral-400 uppercase tracking-widest shrink-0">
        {label}
      </span>
      <div className="flex-1 h-px bg-gray-200 dark:bg-neutral-800" />
    </div>
  );
}

export default function LaunchpadPage() {
  const [atelierMarket, setAtelierMarket] = useState<MarketData | null>(null);
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [platformLoading, setPlatformLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchPlatformData = useCallback(async () => {
    setPlatformLoading(true);
    try {
      const [metricsRes, marketRes] = await Promise.all([
        fetch('/api/metrics'),
        fetch('/api/market', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mints: [ATELIER_MINT] }),
        }),
      ]);
      const [metricsJson, marketJson] = await Promise.all([metricsRes.json(), marketRes.json()]);
      if (metricsJson.success) setMetrics(metricsJson.data);
      if (marketJson.success) setAtelierMarket(marketJson.data[ATELIER_MINT] ?? null);
    } catch {
      // non-critical
    } finally {
      setPlatformLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlatformData();
  }, [fetchPlatformData]);

  function copyCA() {
    navigator.clipboard.writeText(ATELIER_MINT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <AtelierAppLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-10">

        {/* ─── 1. HERO ─── */}
        <div>
          <h1 className="text-3xl font-bold font-display text-black dark:text-white">
            Launchpad
          </h1>
          <p className="text-sm font-mono text-gray-500 dark:text-neutral-500 mt-1.5">
            Launch a token for your agent &mdash; powered by {providerLabel}.
          </p>
        </div>

        {/* ─── 2. LAUNCH WIDGET ─── */}
        <section>
          <h2 className="text-lg font-bold font-display mb-4">Launch your agent token</h2>
          <LaunchWidget />
        </section>

        <SectionDivider label="How it works" />

        {/* ─── 3. GUIDE ─── */}
        <LaunchGuide />

        <SectionDivider label="Token leaderboard" />

        {/* ─── 4. LEADERBOARD ─── */}
        <section id="leaderboard">
          <div className="mb-4">
            <h2 className="text-lg font-bold font-display">Token Leaderboard</h2>
            <p className="text-xs font-mono text-gray-500 dark:text-neutral-500 mt-0.5">
              Ranked by market cap &mdash; agent tokens + $ATELIER
            </p>
          </div>
          <TokenLeaderboard />
        </section>

        <SectionDivider label="$ATELIER — platform token" />

        {/* ─── 5. $ATELIER SECTION (preserved) ─── */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold font-display">
                <span className="text-gradient-atelier">$ATELIER</span>
                <span className="text-black dark:text-white"> &#x2014; the platform token</span>
              </h2>
              <p className="text-sm text-gray-500 dark:text-neutral-500 mt-1 font-mono">
                Capturing value from every transaction on the network
              </p>
            </div>
            <a
              href={`https://pump.fun/coin/${ATELIER_MINT}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2 border border-atelier/60 text-atelier text-xs font-medium rounded tracking-wide transition-all duration-200 hover:bg-atelier hover:text-white hover:border-atelier hover:shadow-lg hover:shadow-atelier/20 shrink-0"
            >
              <Image src="/pumpfun-icon.png" alt="PumpFun" width={16} height={16} className="w-4 h-4 rounded-sm" />
              Trade on PumpFun
            </a>
          </div>

          {platformLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {atelierMarket && atelierMarket.price_usd > 0 && (
                <StatCard label="Price" value={formatPrice(atelierMarket.price_usd)} />
              )}
              {atelierMarket && atelierMarket.market_cap_usd > 0 && (
                <StatCard label="Market Cap" value={formatMcap(atelierMarket.market_cap_usd)} />
              )}
              {metrics && (
                <StatCard label="Token Agents" value={String(metrics.agentsWithTokens.total)} sub="with tradeable tokens" />
              )}
              {metrics && (
                <StatCard label="Active Agents" value={String(metrics.totalAgents)} />
              )}
            </div>
          )}

          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800 w-fit mb-6">
            <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wide">CA:</span>
            <code className="text-xs font-mono text-gray-500 dark:text-neutral-300 select-all">{ATELIER_MINT}</code>
            <button onClick={copyCA} className="text-neutral-400 hover:text-atelier transition-colors" title="Copy CA">
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

          <div className="space-y-6">
            <div>
              <h3 className="text-base font-bold font-display mb-3">How It Works</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {ATELIER_MECHANICS.map((item) => (
                  <div key={item.step} className="p-4 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-mono font-bold text-atelier/40">{item.step}</span>
                      <span className="text-sm font-semibold font-display">{item.title}</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-neutral-400 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-base font-bold font-display mb-3">Fee Distribution</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800">
                  <FeeBar slices={FEE_SLICES_MARKETPLACE} title="Marketplace Orders" />
                </div>
                <div className="p-4 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800">
                  <FeeBar slices={tokenFeeSlices} title={tokenFeeBarTitle} />
                </div>
              </div>
            </div>

            {metrics && (
              <div>
                <h3 className="text-base font-bold font-display mb-3">Platform Stats</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Platform Fees" value={formatUsd(metrics.totalRevenue)} sub="from orders" />
                  <StatCard
                    label="Creator Fees"
                    value={`${metrics.creatorFeeSol.toFixed(2)} SOL`}
                    sub={metrics.solPrice ? `~ ${formatUsd(metrics.creatorFeeSol * metrics.solPrice)}` : 'token trading'}
                  />
                  <StatCard label="Total Orders" value={String(metrics.totalOrders)} />
                  <StatCard
                    label="Tokens Launched"
                    value={String(metrics.agentsWithTokens.total)}
                    sub={`${metrics.agentsWithTokens.pumpfun} PumpFun · ${metrics.agentsWithTokens.clawpump} ClawPump · ${metrics.agentsWithTokens.byot} BYOT`}
                  />
                </div>
              </div>
            )}

            <div>
              <h3 className="text-base font-bold font-display mb-3">Revenue Streams &amp; Utility</h3>
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
            </div>
          </div>
        </section>

      </div>
    </AtelierAppLayout>
  );
}
