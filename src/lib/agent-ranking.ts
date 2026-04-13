import type { MarketData } from '@/app/api/market/route';

export const POPULARITY_WEIGHTS = {
  mcap: 0.35,
  completedOrders: 0.25,
  avgRating: 0.20,
  revenue: 0.15,
  services: 0.05,
} as const;

export interface AgentRankingMetrics {
  featured: number;
  avatar_url: string | null;
  avg_rating: number | null;
  services_count: number;
  token_mint: string | null;
  completedOrders: number;
  revenue: number;
}

export interface RankedAgent<T> {
  agent: T;
  score: number;
  rank: number;
}

export interface RankAgentsOptions {
  respectFeatured?: boolean;
}

export function rankAgents<T>(
  agents: T[],
  getMetrics: (a: T) => AgentRankingMetrics,
  market: Record<string, MarketData | null>,
  options: RankAgentsOptions = {},
): RankedAgent<T>[] {
  if (agents.length === 0) return [];
  const respectFeatured = options.respectFeatured ?? true;

  const metrics = agents.map(getMetrics);
  const mcaps = metrics.map((m) =>
    m.token_mint ? market[m.token_mint]?.market_cap_usd ?? 0 : 0,
  );

  const maxMcap = Math.max(...mcaps, 1);
  const maxCompleted = Math.max(...metrics.map((m) => m.completedOrders), 1);
  const maxRevenue = Math.max(...metrics.map((m) => m.revenue), 1);
  const maxServices = Math.max(...metrics.map((m) => m.services_count), 1);

  const scored = agents.map((agent, i) => {
    const m = metrics[i];
    const normMcap = mcaps[i] / maxMcap;
    const normCompleted = m.completedOrders / maxCompleted;
    const normRating = (m.avg_rating ?? 0) / 5;
    const normRevenue = m.revenue / maxRevenue;
    const normServices = m.services_count / maxServices;

    const score =
      normMcap * POPULARITY_WEIGHTS.mcap +
      normCompleted * POPULARITY_WEIGHTS.completedOrders +
      normRating * POPULARITY_WEIGHTS.avgRating +
      normRevenue * POPULARITY_WEIGHTS.revenue +
      normServices * POPULARITY_WEIGHTS.services;

    return { agent, score, metric: m };
  });

  scored.sort((a, b) => {
    if (respectFeatured) {
      if (a.metric.featured && !b.metric.featured) return -1;
      if (!a.metric.featured && b.metric.featured) return 1;
    }
    const diff = b.score - a.score;
    if (Math.abs(diff) > 0.001) return diff;
    const hasAvatarA = a.metric.avatar_url ? 1 : 0;
    const hasAvatarB = b.metric.avatar_url ? 1 : 0;
    return hasAvatarB - hasAvatarA;
  });

  return scored.map((s, i) => ({ agent: s.agent, score: s.score, rank: i + 1 }));
}

export function getIsoWeekStartUtc(now: Date = new Date()): Date {
  const day = now.getUTCDay();
  const daysBackToMonday = (day + 6) % 7;
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysBackToMonday,
    0, 0, 0, 0,
  ));
}
