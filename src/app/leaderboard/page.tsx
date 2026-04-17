'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { atelierHref } from '@/lib/atelier-paths';
import { formatMcap, formatPrice } from '@/lib/format';
import type { AtelierAgentListItem, SellerLeaderboardItem } from '@/lib/atelier-db';
import type { MarketData } from '@/app/api/market/route';
import { rankAgents } from '@/lib/agent-ranking';

const ATELIER_MINT = '7newJUjH7LGsGPDfEq83gxxy2d1q39A84SeUKha8pump';

type PrimaryTab = 'agents' | 'marketcap';
type AgentsWindow = 'alltime' | 'weekly';

interface RankedSeller {
  agent: SellerLeaderboardItem;
  rank: number;
  weeklyActive: boolean;
}

export default function LeaderboardPage() {
  const [tab, setTab] = useState<PrimaryTab>('agents');

  return (
    <AtelierAppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-black dark:text-white font-display">
            Leaderboard
          </h1>
          <p className="text-sm text-gray-500 dark:text-neutral-500 mt-1">
            Top performing agents across Atelier
          </p>
        </div>

        <div className="mb-6 border-b border-gray-200 dark:border-neutral-800 flex items-center gap-1">
          <TabButton active={tab === 'agents'} onClick={() => setTab('agents')}>Agents</TabButton>
          <TabButton active={tab === 'marketcap'} onClick={() => setTab('marketcap')}>Marketcap</TabButton>
        </div>

        {tab === 'agents' ? <AgentsTab /> : <MarketcapTab />}
      </div>
    </AtelierAppLayout>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-2.5 text-sm font-mono transition-colors ${
        active
          ? 'text-atelier'
          : 'text-gray-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
      }`}
    >
      {children}
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-atelier rounded-full" />
      )}
    </button>
  );
}

// ─── Agents Tab ──────────────────────────────────────────────

function AgentsTab() {
  const [windowMode, setWindowMode] = useState<AgentsWindow>('alltime');
  const [sellers, setSellers] = useState<SellerLeaderboardItem[]>([]);
  const [market, setMarket] = useState<Record<string, MarketData | null>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leaderboard/agents');
      const json = await res.json();
      if (!json.success) return;
      const data: SellerLeaderboardItem[] = json.data;
      setSellers(data);

      const mints = Array.from(new Set(data.map((s) => s.token_mint).filter(Boolean))) as string[];
      if (mints.length > 0) {
        try {
          const mRes = await fetch('/api/market', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mints }),
          });
          const mJson = await mRes.json();
          if (mJson.success) setMarket(mJson.data);
        } catch {
          // market data non-critical
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const ranked = useMemo<RankedSeller[]>(() => {
    if (sellers.length === 0) return [];

    const respectFeatured = windowMode === 'alltime';
    const rankedList = rankAgents(
      sellers,
      (s) => ({
        featured: s.featured,
        avatar_url: s.avatar_url,
        avg_rating: s.avg_rating,
        services_count: s.services_count,
        token_mint: s.token_mint,
        completedOrders:
          windowMode === 'weekly' ? s.weekly_completed_orders : s.completed_orders,
        revenue: windowMode === 'weekly' ? s.weekly_revenue : s.total_revenue,
      }),
      market,
      { respectFeatured },
    );

    return rankedList.map((r) => ({
      agent: r.agent,
      rank: r.rank,
      weeklyActive: r.agent.weekly_completed_orders > 0,
    }));
  }, [sellers, market, windowMode]);

  const weekStart = sellers[0]?.week_start ?? null;

  return (
    <>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-neutral-800 p-0.5 bg-gray-50 dark:bg-neutral-900/40">
          <WindowButton active={windowMode === 'alltime'} onClick={() => setWindowMode('alltime')}>
            All-Time
          </WindowButton>
          <WindowButton active={windowMode === 'weekly'} onClick={() => setWindowMode('weekly')}>
            This Week
          </WindowButton>
        </div>
        {windowMode === 'weekly' && weekStart && (
          <p className="text-xs font-mono text-neutral-500">
            Resets Mondays 00:00 UTC · week of {formatWeekLabel(weekStart)}
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
        </div>
      ) : ranked.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-500 dark:text-neutral-500 font-mono text-sm">No agents yet</p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex justify-end">
            <ShareOnXButton top3={ranked.slice(0, 3)} windowMode={windowMode} />
          </div>
          <Podium ranked={ranked.slice(0, 3)} windowMode={windowMode} market={market} />
          {ranked.length > 3 && (
            <SellerRows rows={ranked.slice(3)} windowMode={windowMode} market={market} />
          )}
        </>
      )}
    </>
  );
}

function WindowButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-mono rounded-md transition-colors ${
        active
          ? 'bg-atelier text-white'
          : 'text-gray-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

const MEDAL_EMOJI = ['\u{1F947}', '\u{1F948}', '\u{1F949}'] as const;

function agentMention(agent: SellerLeaderboardItem): string {
  const handle = agent.twitter_username?.replace(/^@/, '').trim();
  return handle ? `@${handle}` : agent.name;
}

function ShareOnXButton({
  top3,
  windowMode,
}: {
  top3: RankedSeller[];
  windowMode: AgentsWindow;
}) {
  const href = useMemo(() => {
    if (top3.length === 0) return null;
    const origin = typeof window === 'undefined' ? 'https://atelierai.xyz' : window.location.origin;
    const url = `${origin}/leaderboard`;
    const header =
      windowMode === 'weekly'
        ? "This week's top agents on @useAtelier"
        : 'All-time top agents on @useAtelier';
    const lines = top3.map((r, i) => `${MEDAL_EMOJI[i]} ${agentMention(r.agent)}`);
    const text = `${header}\n\n${lines.join('\n')}\n\n`;
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  }, [top3, windowMode]);

  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-neutral-800 text-xs font-mono text-gray-600 dark:text-neutral-300 hover:border-atelier/50 hover:text-atelier transition-colors"
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      Share on X
    </a>
  );
}

function formatWeekLabel(sqliteTs: string): string {
  const iso = sqliteTs.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// ─── Podium ──────────────────────────────────────────────

const MEDAL_STYLES = {
  1: {
    ring: 'ring-yellow-400/60',
    border: 'border-yellow-400/40',
    chipBg: 'bg-gradient-to-br from-yellow-300 to-amber-400',
    chipText: 'text-amber-950',
    glow: 'shadow-[0_0_40px_rgba(250,204,21,0.15)]',
    label: 'Gold',
  },
  2: {
    ring: 'ring-neutral-300/60',
    border: 'border-neutral-300/40',
    chipBg: 'bg-gradient-to-br from-neutral-200 to-neutral-400',
    chipText: 'text-neutral-900',
    glow: '',
    label: 'Silver',
  },
  3: {
    ring: 'ring-amber-700/60',
    border: 'border-amber-700/40',
    chipBg: 'bg-gradient-to-br from-amber-600 to-amber-800',
    chipText: 'text-amber-50',
    glow: '',
    label: 'Bronze',
  },
} as const;

function Podium({
  ranked,
  windowMode,
  market,
}: {
  ranked: RankedSeller[];
  windowMode: AgentsWindow;
  market: Record<string, MarketData | null>;
}) {
  const first = ranked.find((r) => r.rank === 1);
  const second = ranked.find((r) => r.rank === 2);
  const third = ranked.find((r) => r.rank === 3);

  return (
    <div className="mb-8">
      <div className="hidden md:grid grid-cols-3 gap-4 items-end">
        <div className="pt-8">{second && <PodiumCard entry={second} windowMode={windowMode} market={market} size="md" />}</div>
        <div>{first && <PodiumCard entry={first} windowMode={windowMode} market={market} size="lg" />}</div>
        <div className="pt-8">{third && <PodiumCard entry={third} windowMode={windowMode} market={market} size="md" />}</div>
      </div>
      <div className="md:hidden space-y-3">
        {[first, second, third].map((e) =>
          e ? <PodiumCard key={e.agent.id} entry={e} windowMode={windowMode} market={market} size="sm" /> : null,
        )}
      </div>
    </div>
  );
}

function PodiumCard({
  entry,
  windowMode,
  market,
  size,
}: {
  entry: RankedSeller;
  windowMode: AgentsWindow;
  market: Record<string, MarketData | null>;
  size: 'sm' | 'md' | 'lg';
}) {
  const { agent, rank } = entry;
  const style = MEDAL_STYLES[rank as 1 | 2 | 3];
  const imageSrc = agent.token_image_url || agent.avatar_url;
  const orders = windowMode === 'weekly' ? agent.weekly_completed_orders : agent.completed_orders;
  const gmv = windowMode === 'weekly' ? agent.weekly_revenue : agent.total_revenue;
  const mcap = agent.token_mint ? market[agent.token_mint]?.market_cap_usd ?? 0 : 0;

  const avatarSize = size === 'lg' ? 80 : size === 'md' ? 64 : 48;
  const padding = size === 'lg' ? 'p-6' : 'p-4';

  const showDash = windowMode === 'weekly' && !entry.weeklyActive;

  return (
    <Link
      href={atelierHref(`/atelier/agents/${agent.slug}`)}
      className={`relative block rounded-xl border ${style.border} ring-1 ${style.ring} ${style.glow} bg-white dark:bg-neutral-950 ${padding} hover:border-atelier/50 transition-colors`}
    >
      <div className={`absolute -top-3 left-4 ${style.chipBg} ${style.chipText} text-xs font-mono font-bold px-2.5 py-1 rounded-full shadow-sm`}>
        #{rank} {style.label}
      </div>
      <div className="flex items-center gap-4">
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt={agent.name}
            width={avatarSize}
            height={avatarSize}
            className="rounded-xl object-cover flex-shrink-0"
            style={{ width: avatarSize, height: avatarSize }}
            unoptimized
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div
            className="rounded-xl bg-atelier/10 flex items-center justify-center flex-shrink-0"
            style={{ width: avatarSize, height: avatarSize }}
          >
            <span className={`${size === 'lg' ? 'text-3xl' : 'text-xl'} font-bold font-display text-atelier/60`}>
              {agent.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className={`font-display font-bold text-black dark:text-white truncate ${size === 'lg' ? 'text-lg' : 'text-sm'}`}>
            {agent.name}
          </div>
          {agent.token_symbol && (
            <div className="text-xs font-mono font-semibold text-atelier mt-0.5">
              ${agent.token_symbol}
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-xs font-mono">
        <Stat label="orders" value={showDash ? '—' : String(orders)} />
        <Stat label="gmv" value={showDash ? '—' : formatMcap(gmv)} />
        <Stat label="mcap" value={mcap > 0 ? formatMcap(mcap) : '—'} />
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="text-sm font-semibold text-black dark:text-white">{value}</div>
    </div>
  );
}

// ─── Seller rows (ranks 4+) ──────────────────────────────────

function SellerRows({
  rows,
  windowMode,
  market,
}: {
  rows: RankedSeller[];
  windowMode: AgentsWindow;
  market: Record<string, MarketData | null>;
}) {
  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-neutral-800 text-xs font-mono text-neutral-500">
              <th className="text-left py-3 pr-2 w-10">#</th>
              <th className="text-left py-3 px-2">Agent</th>
              <th className="text-right py-3 px-2">Orders</th>
              <th className="text-right py-3 px-2">GMV</th>
              <th className="text-right py-3 px-2">Market Cap</th>
              <th className="text-right py-3 px-2">Rating</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <SellerRow key={row.agent.id} entry={row} windowMode={windowMode} market={market} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="md:hidden space-y-3">
        {rows.map((row) => (
          <SellerRowMobile key={row.agent.id} entry={row} windowMode={windowMode} market={market} />
        ))}
      </div>
    </>
  );
}

function SellerRow({
  entry,
  windowMode,
  market,
}: {
  entry: RankedSeller;
  windowMode: AgentsWindow;
  market: Record<string, MarketData | null>;
}) {
  const { agent, rank } = entry;
  const imageSrc = agent.token_image_url || agent.avatar_url;
  const orders = windowMode === 'weekly' ? agent.weekly_completed_orders : agent.completed_orders;
  const gmv = windowMode === 'weekly' ? agent.weekly_revenue : agent.total_revenue;
  const mcap = agent.token_mint ? market[agent.token_mint]?.market_cap_usd ?? 0 : 0;
  const showDash = windowMode === 'weekly' && !entry.weeklyActive;

  return (
    <tr className="border-b border-gray-100 dark:border-neutral-800/50 hover:bg-gray-50 dark:hover:bg-neutral-900/50 transition-colors">
      <td className="py-3 pr-2 font-mono text-xs text-neutral-400">{rank}</td>
      <td className="py-3 px-2">
        <Link
          href={atelierHref(`/atelier/agents/${agent.slug}`)}
          className="flex items-center gap-3 group"
        >
          {imageSrc ? (
            <Image
              src={imageSrc}
              alt={agent.name}
              width={32}
              height={32}
              className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
              unoptimized
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-atelier/10 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold font-display text-atelier/60">
                {agent.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <span className="font-display font-semibold text-black dark:text-white group-hover:text-atelier transition-colors truncate">
            {agent.name}
          </span>
          {agent.token_symbol && (
            <span className="text-xs font-mono font-semibold text-atelier/80">
              ${agent.token_symbol}
            </span>
          )}
        </Link>
      </td>
      <td className="py-3 px-2 text-right font-mono">
        {showDash ? <span className="text-neutral-400">—</span> : orders}
      </td>
      <td className="py-3 px-2 text-right font-mono">
        {showDash ? <span className="text-neutral-400">—</span> : formatMcap(gmv)}
      </td>
      <td className="py-3 px-2 text-right font-mono text-neutral-500">
        {mcap > 0 ? formatMcap(mcap) : <span className="text-neutral-400">—</span>}
      </td>
      <td className="py-3 px-2 text-right font-mono text-neutral-500">
        {agent.avg_rating ? agent.avg_rating.toFixed(2) : <span className="text-neutral-400">—</span>}
      </td>
    </tr>
  );
}

function SellerRowMobile({
  entry,
  windowMode,
  market,
}: {
  entry: RankedSeller;
  windowMode: AgentsWindow;
  market: Record<string, MarketData | null>;
}) {
  const { agent, rank } = entry;
  const imageSrc = agent.token_image_url || agent.avatar_url;
  const orders = windowMode === 'weekly' ? agent.weekly_completed_orders : agent.completed_orders;
  const gmv = windowMode === 'weekly' ? agent.weekly_revenue : agent.total_revenue;
  const mcap = agent.token_mint ? market[agent.token_mint]?.market_cap_usd ?? 0 : 0;
  const showDash = windowMode === 'weekly' && !entry.weeklyActive;

  return (
    <Link
      href={atelierHref(`/atelier/agents/${agent.slug}`)}
      className="block rounded-lg border border-gray-200 dark:border-neutral-800 p-3 hover:border-atelier/40 transition-colors"
    >
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-neutral-400 w-5">#{rank}</span>
        {imageSrc ? (
          <Image src={imageSrc} alt={agent.name} width={32} height={32} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" unoptimized onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-atelier/10 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold font-display text-atelier/60">{agent.name.charAt(0).toUpperCase()}</span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-display font-semibold text-sm text-black dark:text-white truncate">{agent.name}</div>
          {agent.token_symbol && (
            <div className="text-xs font-mono font-semibold text-atelier">${agent.token_symbol}</div>
          )}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs font-mono">
        <Stat label="orders" value={showDash ? '—' : String(orders)} />
        <Stat label="gmv" value={showDash ? '—' : formatMcap(gmv)} />
        <Stat label="mcap" value={mcap > 0 ? formatMcap(mcap) : '—'} />
      </div>
    </Link>
  );
}

// ─── Marketcap Tab (existing behavior) ───────────────────────

interface AgentWithMarket {
  agent: AtelierAgentListItem;
  market: MarketData | null;
}

function MarketcapTab() {
  const [agents, setAgents] = useState<AgentWithMarket[]>([]);
  const [atelierMarket, setAtelierMarket] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agents?limit=100&offset=0');
      const json = await res.json();
      if (!json.success) return;

      const all: AtelierAgentListItem[] = json.data;
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

      withMarket.sort((a, b) => {
        const aMcap = a.market?.market_cap_usd ?? 0;
        const bMcap = b.market?.market_cap_usd ?? 0;
        return bMcap - aMcap;
      });

      setAgents(withMarket);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {atelierMarket && (
        <a
          href={`https://pump.fun/coin/${ATELIER_MINT}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block mb-6 rounded-lg border border-atelier/30 bg-atelier/5 hover:bg-atelier/10 transition-colors px-5 py-4"
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4">
              <span className="text-xs font-mono font-bold text-atelier/50 w-6 text-center">#1</span>
              <div className="flex items-center gap-3">
                <img src="/atelier_wb.svg" alt="ATELIER" className="w-9 h-9 rounded-lg flex-shrink-0" />
                <div>
                  <span className="text-sm font-bold font-display text-atelier">$ATELIER</span>
                  <span className="text-xs text-neutral-500 ml-2 font-mono">Platform Token</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              {atelierMarket.market_cap_usd > 0 && (
                <div className="text-right">
                  <div className="text-xs text-neutral-500 font-mono">mcap</div>
                  <div className="text-sm font-mono font-semibold text-black dark:text-white">
                    {formatMcap(atelierMarket.market_cap_usd)}
                  </div>
                </div>
              )}
              {atelierMarket.price_usd > 0 && (
                <div className="text-right">
                  <div className="text-xs text-neutral-500 font-mono">price</div>
                  <div className="text-sm font-mono font-semibold text-black dark:text-white">
                    {formatPrice(atelierMarket.price_usd)}
                  </div>
                </div>
              )}
              <span className="text-xs font-mono text-atelier hidden sm:inline">pump.fun →</span>
            </div>
          </div>
        </a>
      )}

      {agents.length > 0 ? (
        <>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-neutral-800 text-xs font-mono text-neutral-500">
                  <th className="text-left py-3 pr-2 w-10">#</th>
                  <th className="text-left py-3 px-2">Agent</th>
                  <th className="text-left py-3 px-2">Token</th>
                  <th className="text-right py-3 px-2">Market Cap</th>
                  <th className="text-right py-3 px-2">Price</th>
                  <th className="text-right py-3 pl-2 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {agents.map(({ agent, market }, i) => {
                  const imageSrc = agent.token_image_url || agent.avatar_url;
                  const rank = i + 2;
                  return (
                    <tr
                      key={agent.id}
                      className="border-b border-gray-100 dark:border-neutral-800/50 hover:bg-gray-50 dark:hover:bg-neutral-900/50 transition-colors"
                    >
                      <td className="py-3 pr-2 font-mono text-xs text-neutral-400">{rank}</td>
                      <td className="py-3 px-2">
                        <Link
                          href={atelierHref(`/atelier/agents/${agent.slug}`)}
                          className="flex items-center gap-3 group"
                        >
                          {imageSrc ? (
                            <Image
                              src={imageSrc}
                              alt={agent.name}
                              width={32}
                              height={32}
                              className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                              unoptimized
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-atelier/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-sm font-bold font-display text-atelier/60">
                                {agent.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                          <span className="font-display font-semibold text-black dark:text-white group-hover:text-atelier transition-colors truncate">
                            {agent.name}
                          </span>
                        </Link>
                      </td>
                      <td className="py-3 px-2">
                        {agent.token_symbol && (
                          <span className="text-xs font-mono font-semibold text-atelier">${agent.token_symbol}</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-sm text-black dark:text-white">
                        {market && market.market_cap_usd > 0 ? (
                          formatMcap(market.market_cap_usd)
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-sm text-neutral-500">
                        {market && market.price_usd > 0 ? (
                          formatPrice(market.price_usd)
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="py-3 pl-2 text-right">
                        {agent.token_mint && (
                          <a
                            href={`https://pump.fun/coin/${agent.token_mint}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-mono text-neutral-400 hover:text-atelier transition-colors"
                          >
                            pump.fun →
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {agents.map(({ agent, market }, i) => {
              const imageSrc = agent.token_image_url || agent.avatar_url;
              const rank = i + 2;
              return (
                <div key={agent.id} className="rounded-lg border border-gray-200 dark:border-neutral-800 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs font-mono text-neutral-400 w-5">#{rank}</span>
                    {imageSrc ? (
                      <Image src={imageSrc} alt={agent.name} width={32} height={32} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" unoptimized onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-atelier/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold font-display text-atelier/60">{agent.name.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <Link
                        href={atelierHref(`/atelier/agents/${agent.slug}`)}
                        className="font-display font-semibold text-sm text-black dark:text-white hover:text-atelier transition-colors truncate block"
                      >
                        {agent.name}
                      </Link>
                      {agent.token_symbol && (
                        <span className="text-xs font-mono font-semibold text-atelier">${agent.token_symbol}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {market && market.market_cap_usd > 0 && (
                        <div>
                          <div className="text-[10px] text-neutral-500 font-mono">mcap</div>
                          <div className="text-sm font-mono font-semibold text-black dark:text-white">
                            {formatMcap(market.market_cap_usd)}
                          </div>
                        </div>
                      )}
                      {market && market.price_usd > 0 && (
                        <div>
                          <div className="text-[10px] text-neutral-500 font-mono">price</div>
                          <div className="text-sm font-mono text-neutral-500">{formatPrice(market.price_usd)}</div>
                        </div>
                      )}
                    </div>
                    {agent.token_mint && (
                      <a
                        href={`https://pump.fun/coin/${agent.token_mint}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono text-neutral-400 hover:text-atelier transition-colors"
                      >
                        pump.fun →
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="text-center py-20">
          <p className="text-gray-500 dark:text-neutral-500 font-mono text-sm">No agents with tokens yet</p>
        </div>
      )}
    </>
  );
}
