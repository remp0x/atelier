/**
 * Live marketplace data layer for the Ask-Atelier support assistant.
 *
 * The assistant is otherwise grounded only in static docs (see support-rag.ts),
 * so it can't answer "what are the top agents?", "find 3 image agents", or
 * "which token agent has the highest market cap?". This module builds a compact,
 * frequently-refreshed snapshot of public marketplace data and feeds it to the
 * generation model as additional grounding.
 *
 * Phase A (current): the snapshot is injected wholesale into the model context.
 * The structured fetchers below (topAgents / agentsByCategory / topAgentsByMarketCap
 * / trendingServices) are written as standalone query functions so they can be
 * exposed as model tools (function calling) in Phase B without rework.
 *
 * All data here is public (same as the /api/agents, /api/services, /api/market
 * endpoints). Fail-open: any failure yields null and the assistant falls back to
 * doc-only grounding.
 */

import {
  getAtelierAgents,
  getTrendingServices,
  type AtelierAgentListItem,
  type ServiceCategory,
  type TrendingService,
} from '@/lib/atelier-db';
import { getMarketData } from '@/lib/market-data';
import { CATEGORY_LABELS } from '@/components/atelier/constants';

const SNAPSHOT_TTL_MS = 3 * 60 * 1000;
const POOL_SIZE = 60;
const TOP_AGENTS = 15;
const PER_CATEGORY = 5;
const TOP_BY_MCAP = 10;
const TRENDING = 8;

export interface MarketplaceAgent {
  name: string;
  slug: string;
  twitter_username: string | null;
  categories: string[];
  completed_orders: number;
  avg_rating: number | null;
  token_symbol: string | null;
  market_cap_usd: number | null;
}

export interface MarketplaceSnapshot {
  topAgents: MarketplaceAgent[];
  agentsByCategory: Array<{ category: string; agents: MarketplaceAgent[] }>;
  topByMarketCap: MarketplaceAgent[];
  trending: TrendingService[];
}

function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key as ServiceCategory] ?? key;
}

function toMarketplaceAgent(
  a: AtelierAgentListItem,
  market: Record<string, { market_cap_usd: number } | null>,
): MarketplaceAgent {
  return {
    name: a.name,
    slug: a.slug,
    twitter_username: a.twitter_username,
    categories: (a.categories || []).map(categoryLabel),
    completed_orders: a.completed_orders,
    avg_rating: a.avg_rating,
    token_symbol: a.token_symbol,
    market_cap_usd: a.token_mint ? market[a.token_mint]?.market_cap_usd ?? null : null,
  };
}

async function buildSnapshot(): Promise<MarketplaceSnapshot | null> {
  const pool = await getAtelierAgents({ sortBy: 'popular', hasServices: true, limit: POOL_SIZE });
  if (pool.length === 0) return null;

  const mints = pool.map((a) => a.token_mint).filter((m): m is string => !!m);
  const market = mints.length > 0 ? await getMarketData(mints) : {};

  const agents = pool.map((a) => toMarketplaceAgent(a, market));

  const byCategory = new Map<string, MarketplaceAgent[]>();
  for (const agent of agents) {
    for (const cat of agent.categories) {
      const list = byCategory.get(cat) ?? [];
      if (list.length < PER_CATEGORY) list.push(agent);
      byCategory.set(cat, list);
    }
  }

  const topByMarketCap = agents
    .filter((a) => a.market_cap_usd && a.market_cap_usd > 0)
    .sort((a, b) => (b.market_cap_usd ?? 0) - (a.market_cap_usd ?? 0))
    .slice(0, TOP_BY_MCAP);

  let trending: TrendingService[] = [];
  try {
    trending = await getTrendingServices({ limit: TRENDING });
  } catch {
    trending = [];
  }

  return {
    topAgents: agents.slice(0, TOP_AGENTS),
    agentsByCategory: Array.from(byCategory.entries()).map(([category, list]) => ({ category, agents: list })),
    topByMarketCap,
    trending,
  };
}

let snapshotCache: { snapshot: MarketplaceSnapshot; at: number } | null = null;
let buildInFlight: Promise<MarketplaceSnapshot | null> | null = null;

export async function getMarketplaceSnapshot(): Promise<MarketplaceSnapshot | null> {
  if (snapshotCache && Date.now() - snapshotCache.at < SNAPSHOT_TTL_MS) return snapshotCache.snapshot;
  if (buildInFlight) return buildInFlight;

  buildInFlight = buildSnapshot()
    .then((snapshot) => {
      if (snapshot) snapshotCache = { snapshot, at: Date.now() };
      return snapshot ?? snapshotCache?.snapshot ?? null;
    })
    .catch(() => snapshotCache?.snapshot ?? null)
    .finally(() => {
      buildInFlight = null;
    });

  return buildInFlight;
}

function formatMcap(usd: number): string {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
  return `$${Math.round(usd)}`;
}

function formatAgent(a: MarketplaceAgent): string {
  const parts: string[] = [a.name];
  if (a.twitter_username) parts.push(`(@${a.twitter_username})`);
  const meta: string[] = [`${a.completed_orders} orders`];
  if (a.avg_rating != null) meta.push(`${a.avg_rating.toFixed(1)}/5`);
  if (a.categories.length) meta.push(a.categories.join('/'));
  if (a.token_symbol) {
    meta.push(a.market_cap_usd ? `$${a.token_symbol} mcap ${formatMcap(a.market_cap_usd)}` : `$${a.token_symbol}`);
  }
  parts.push(`-- ${meta.join(', ')}`);
  parts.push(`[/agents/${a.slug}]`);
  return parts.join(' ');
}

/**
 * Serialize the live snapshot into a compact context block for the assistant.
 * Returns null when the snapshot can't be built so the caller can fall back to
 * doc-only grounding.
 */
export async function buildMarketplaceContext(): Promise<string | null> {
  const snap = await getMarketplaceSnapshot();
  if (!snap) return null;

  const sections: string[] = [];

  if (snap.topAgents.length) {
    sections.push(
      `TOP AGENTS (most completed orders):\n${snap.topAgents.map((a, i) => `${i + 1}. ${formatAgent(a)}`).join('\n')}`,
    );
  }

  if (snap.agentsByCategory.length) {
    const lines = snap.agentsByCategory
      .map(({ category, agents }) => `${category}: ${agents.map((a) => a.name).join(', ')}`)
      .join('\n');
    sections.push(`AGENTS BY CATEGORY:\n${lines}`);
  }

  if (snap.topByMarketCap.length) {
    const lines = snap.topByMarketCap
      .map((a, i) => `${i + 1}. ${a.name}${a.token_symbol ? ` ($${a.token_symbol})` : ''} -- ${formatMcap(a.market_cap_usd ?? 0)} [/agents/${a.slug}]`)
      .join('\n');
    sections.push(`TOP AGENTS BY TOKEN MARKET CAP:\n${lines}`);
  }

  if (snap.trending.length) {
    const lines = snap.trending
      .map((t, i) => `${i + 1}. ${t.title} by ${t.agent_name} -- ${t.order_count} orders [/agents/${t.agent_slug}]`)
      .join('\n');
    sections.push(`TRENDING SERVICES (recent):\n${lines}`);
  }

  if (sections.length === 0) return null;

  return `=== LIVE MARKETPLACE DATA (snapshot, refreshes every few minutes) ===\n\n${sections.join('\n\n')}`;
}
