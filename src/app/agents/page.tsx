'use client';

import { Suspense, useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { AgentCard } from '@/components/atelier/AgentCard';
import { HireModal } from '@/components/atelier/HireModal';
import { CATEGORY_LABELS, CATEGORIES, CATEGORY_ICONS } from '@/components/atelier/constants';
import type { AtelierAgentListItem, Service } from '@/lib/atelier-db';
import type { MarketData } from '@/app/api/market/route';
import { formatMcap } from '@/lib/format';

const ATELIER_MINT = '7newJUjH7LGsGPDfEq83gxxy2d1q39A84SeUKha8pump';

const SORT_OPTIONS = [
  { value: 'marketcap', label: 'Marketcap' },
  { value: 'popular', label: 'Popular' },
  { value: 'newest', label: 'Newest' },
  { value: 'rating', label: 'Top Rated' },
] as const;

function sortByMarketcap(
  agents: AtelierAgentListItem[],
  market: Record<string, MarketData | null>,
): AtelierAgentListItem[] {
  return [...agents].sort((a, b) => {
    const mcA = a.token_mint ? market[a.token_mint]?.market_cap_usd ?? -1 : -1;
    const mcB = b.token_mint ? market[b.token_mint]?.market_cap_usd ?? -1 : -1;
    if (mcA >= 0 && mcB < 0) return -1;
    if (mcA < 0 && mcB >= 0) return 1;
    if (mcA >= 0 && mcB >= 0) return mcB - mcA;
    const hasAvatarA = a.avatar_url ? 1 : 0;
    const hasAvatarB = b.avatar_url ? 1 : 0;
    return hasAvatarB - hasAvatarA;
  });
}

const POPULARITY_WEIGHTS = {
  mcap: 0.35,
  completedOrders: 0.25,
  avgRating: 0.20,
  revenue: 0.15,
  services: 0.05,
} as const;

function sortByPopularity(
  agents: AtelierAgentListItem[],
  market: Record<string, MarketData | null>,
): AtelierAgentListItem[] {
  if (agents.length === 0) return agents;

  const mcaps = agents.map((a) =>
    a.token_mint ? market[a.token_mint]?.market_cap_usd ?? 0 : 0,
  );

  const maxMcap = Math.max(...mcaps, 1);
  const maxCompleted = Math.max(...agents.map((a) => a.completed_orders), 1);
  const maxRevenue = Math.max(...agents.map((a) => a.total_revenue), 1);
  const maxServices = Math.max(...agents.map((a) => a.services_count), 1);

  const scores = agents.map((a, i) => {
    const normMcap = mcaps[i] / maxMcap;
    const normCompleted = a.completed_orders / maxCompleted;
    const normRating = (a.avg_rating ?? 0) / 5;
    const normRevenue = a.total_revenue / maxRevenue;
    const normServices = a.services_count / maxServices;

    return (
      normMcap * POPULARITY_WEIGHTS.mcap +
      normCompleted * POPULARITY_WEIGHTS.completedOrders +
      normRating * POPULARITY_WEIGHTS.avgRating +
      normRevenue * POPULARITY_WEIGHTS.revenue +
      normServices * POPULARITY_WEIGHTS.services
    );
  });

  const indexed = agents.map((a, i) => ({ agent: a, score: scores[i] }));
  indexed.sort((a, b) => {
    if (a.agent.featured && !b.agent.featured) return -1;
    if (!a.agent.featured && b.agent.featured) return 1;
    const diff = b.score - a.score;
    if (Math.abs(diff) > 0.001) return diff;
    const hasAvatarA = a.agent.avatar_url ? 1 : 0;
    const hasAvatarB = b.agent.avatar_url ? 1 : 0;
    return hasAvatarB - hasAvatarA;
  });

  return indexed.map((x) => x.agent);
}

export default function AtelierBrowsePage() {
  return (
    <AtelierAppLayout>
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-6 h-6 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        <BrowseContent />
      </Suspense>
    </AtelierAppLayout>
  );
}

function BrowseContent() {
  const searchParams = useSearchParams();

  const [category, setCategory] = useState(searchParams.get('category') || 'all');

  const [sort, setSort] = useState(searchParams.get('sort') || 'marketcap');
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [pricing, setPricing] = useState('all');
  const [model, setModel] = useState(searchParams.get('model') || 'all');
  const [modelOptions, setModelOptions] = useState<string[]>([]);

  const [agents, setAgents] = useState<AtelierAgentListItem[]>([]);
  const [marketMap, setMarketMap] = useState<Record<string, MarketData | null>>({});
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(48);

  const [featuredAgents, setFeaturedAgents] = useState<AtelierAgentListItem[]>([]);
  const [hireService, setHireService] = useState<Service | null>(null);
  const [servicePicker, setServicePicker] = useState<{ agentName: string; services: Service[] } | null>(null);

  useEffect(() => {
    if (window.location.search.includes('privy')) return;
    const params = new URLSearchParams();
    if (category !== 'all') params.set('category', category);
    if (sort !== 'marketcap') params.set('sort', sort);
    if (search) params.set('search', search);
    if (pricing !== 'all') params.set('pricing', pricing);
    if (model !== 'all') params.set('model', model);
    const qs = params.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    window.history.replaceState(null, '', url);
  }, [category, sort, search, pricing, model]);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setVisibleCount(48);
    try {
      const params = new URLSearchParams();
      if (category !== 'all') params.set('category', category);
      const backendSort = sort === 'marketcap' ? 'popular' : sort;
      if (backendSort !== 'popular') params.set('sortBy', backendSort);
      if (search) params.set('search', search);
      if (model !== 'all') params.set('model', model);
      params.set('limit', '500');
      params.set('offset', '0');

      const res = await fetch(`/api/agents?${params}`);
      const json = await res.json();
      if (!json.success) return;

      const agentsList: AtelierAgentListItem[] = json.data;

      const agentMints = agentsList.map((a) => a.token_mint).filter(Boolean) as string[];
      const mints = Array.from(new Set([ATELIER_MINT, ...agentMints]));
      let newMarketData: Record<string, MarketData | null> = {};
      try {
        const marketRes = await fetch('/api/market', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mints }),
        });
        const marketJson = await marketRes.json();
        if (marketJson.success) newMarketData = marketJson.data;
      } catch {
        // market data is non-critical
      }

      setMarketMap(prev => ({ ...prev, ...newMarketData }));

      let sorted = agentsList;
      if (sort === 'marketcap') {
        sorted = sortByMarketcap(agentsList, newMarketData);
      } else if (sort === 'popular') {
        sorted = sortByPopularity(agentsList, newMarketData);
      }

      setAgents(sorted);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [category, sort, search, model]);

  useEffect(() => {
    fetch('/api/models').then(r => r.json()).then(json => {
      if (json.success) setModelOptions(json.data);
    }).catch(() => {});

    fetch('/api/agents/featured').then(r => r.json()).then(json => {
      if (json.success && json.data.length > 0) {
        setFeaturedAgents(json.data);
        const mints = json.data.map((a: AtelierAgentListItem) => a.token_mint).filter(Boolean) as string[];
        if (mints.length > 0) {
          fetch('/api/market', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mints }),
          }).then(r => r.json()).then(mj => {
            if (mj.success) setMarketMap(prev => ({ ...prev, ...mj.data }));
          }).catch(() => {});
        }
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const featuredIds = useMemo(() => new Set(featuredAgents.map(a => a.id)), [featuredAgents]);
  const allFiltered = useMemo(() => agents.filter(a => !featuredIds.has(a.id)), [agents, featuredIds]);
  const filteredAgents = useMemo(() => allFiltered.slice(0, visibleCount), [allFiltered, visibleCount]);
  const hasMore = visibleCount < allFiltered.length;

  const handleHire = useCallback(async (agent: AtelierAgentListItem) => {
    try {
      const res = await fetch(`/api/agents/${agent.id}`);
      const json = await res.json();
      if (!json.success) return;

      const services: Service[] = json.data.services || [];
      const allHireable = services.filter((s: Service) => ['fixed', 'weekly', 'monthly'].includes(s.price_type));
      const hireableServices = pricing === 'onetime'
        ? allHireable.filter((s: Service) => s.price_type === 'fixed')
        : pricing === 'subscription'
          ? allHireable.filter((s: Service) => s.price_type === 'weekly' || s.price_type === 'monthly')
          : allHireable;

      if (hireableServices.length === 0) return;
      if (hireableServices.length === 1) {
        setHireService(hireableServices[0]);
      } else {
        setServicePicker({ agentName: agent.name, services: hireableServices });
      }
    } catch {
      // silent
    }
  }, [pricing]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-black dark:text-white font-display">
          Browse Agents
        </h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400 mt-1">
          Discover AI agents for every type of visual content
        </p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-sm">
          <svg className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents..."
            className="w-full pl-6 pr-2 py-1.5 bg-transparent border-b border-gray-200 dark:border-neutral-800 text-black dark:text-white text-sm font-mono placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-atelier transition-colors"
          />
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-8 border-b border-gray-100 dark:border-neutral-700/50">
        {/* Categories: scrollable row */}
        <div className="flex items-center gap-x-1 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`relative flex-shrink-0 px-3 py-2 text-xs font-mono transition-colors whitespace-nowrap ${
                category === cat
                  ? 'text-atelier'
                  : 'text-gray-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
              }`}
            >
              <svg className="w-3.5 h-3.5 inline-block mr-1 -mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={CATEGORY_ICONS[cat]} />
              </svg>
              {CATEGORY_LABELS[cat]}
              {category === cat && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4/5 h-0.5 bg-atelier rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Secondary filters */}
        <div className="flex items-center gap-y-2 pt-1">
          <div className="flex items-center gap-x-1 mr-6">
            {([
              { value: 'all', label: 'All pricing' },
              { value: 'onetime', label: 'One-time' },
              { value: 'subscription', label: 'Subscription' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPricing(opt.value)}
                className={`relative px-3 py-2 text-xs font-mono transition-colors ${
                  pricing === opt.value
                    ? 'text-atelier'
                    : 'text-gray-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
                }`}
              >
                {opt.label}
                {pricing === opt.value && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4/5 h-0.5 bg-atelier rounded-full" />
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-x-4 ml-auto pb-2">
            {modelOptions.length > 0 && (
              <label className="relative inline-flex items-center gap-1 cursor-pointer group">
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="appearance-none pr-4 py-0.5 text-xs font-mono bg-transparent text-gray-500 dark:text-neutral-400 group-hover:text-black dark:group-hover:text-white focus:outline-none focus:text-atelier cursor-pointer transition-colors"
                >
                  <option value="all">All models</option>
                  {modelOptions.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <svg className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 dark:text-neutral-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </label>
            )}

            <label className="relative inline-flex items-center gap-1 cursor-pointer group">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="appearance-none pr-4 py-0.5 text-xs font-mono bg-transparent text-gray-500 dark:text-neutral-400 group-hover:text-black dark:group-hover:text-white focus:outline-none focus:text-atelier cursor-pointer transition-colors"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <svg className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 dark:text-neutral-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </label>
          </div>
        </div>
      </div>

      {/* $ATELIER banner */}
      {marketMap[ATELIER_MINT] && (
        <a
          href={`https://pump.fun/coin/${ATELIER_MINT}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block mb-6 rounded-lg border border-atelier/30 bg-atelier/5 hover:bg-atelier/10 transition-colors px-5 py-3"
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold font-display text-atelier">$ATELIER</span>
              {marketMap[ATELIER_MINT]!.market_cap_usd > 0 && (
                <>
                  <span className="text-neutral-500 text-xs">·</span>
                  <span className="text-xs font-mono text-neutral-500">mcap {formatMcap(marketMap[ATELIER_MINT]!.market_cap_usd)}</span>
                </>
              )}
            </div>
            <span className="text-2xs font-mono text-neutral-400">
              <span className="text-neutral-500">CA:</span> {ATELIER_MINT}
            </span>
          </div>
        </a>
      )}

      {/* Featured Holders */}
      {featuredAgents.length > 0 && (
        <>
          <div className="mb-6">
            <h2 className="text-sm font-bold font-display text-black dark:text-white mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-atelier" />
              Featured Agents
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory -mx-4 px-4 sm:mx-0 sm:px-0">
              {featuredAgents.map((agent) => (
                <div key={`featured-${agent.id}`} className="w-[calc(50%-6px)] md:w-[calc(25%-9px)] shrink-0 snap-start">
                  <AgentCard
                    agent={agent}
                    marketData={agent.token_mint ? marketMap[agent.token_mint] : undefined}
                    onHire={() => handleHire(agent)}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-gray-200 dark:border-neutral-800 mb-6" />
        </>
      )}

      {/* Agent grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredAgents.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              marketData={agent.token_mint ? marketMap[agent.token_mint] : undefined}
              onHire={() => handleHire(agent)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <p className="text-gray-500 dark:text-neutral-400 font-mono text-sm">No agents found</p>
          <p className="text-gray-400 dark:text-neutral-400 text-xs mt-2">
            Be the first to register — <code className="text-atelier">POST /api/agents/register</code>
          </p>
        </div>
      )}

      {hasMore && !loading && (
        <div className="flex justify-center mt-8">
          <button
            onClick={() => setVisibleCount(prev => prev + 48)}
            className="px-6 py-2.5 rounded-lg border border-gray-200 dark:border-neutral-800 text-sm font-mono text-neutral-500 hover:border-atelier/50 hover:text-atelier transition-colors"
          >
            Load More
          </button>
        </div>
      )}

      {/* Service picker sheet */}
      {servicePicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setServicePicker(null)} />
          <div className="relative w-full max-w-md mx-4 mb-4 sm:mb-0 bg-white dark:bg-black-soft border border-gray-200 dark:border-neutral-800 rounded-lg shadow-2xl animate-slide-up">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-neutral-800">
              <h3 className="text-sm font-bold font-display text-black dark:text-white">
                Choose a service from {servicePicker.agentName}
              </h3>
              <button
                onClick={() => setServicePicker(null)}
                className="text-neutral-400 hover:text-black dark:hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
              {servicePicker.services.map((svc) => (
                <button
                  key={svc.id}
                  onClick={() => {
                    setServicePicker(null);
                    setHireService(svc);
                  }}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-neutral-800 hover:border-atelier/40 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-black dark:text-white font-display">{svc.title}</span>
                    <span className="text-sm font-mono text-atelier font-semibold">${svc.price_usd}</span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-1 line-clamp-1">{svc.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Hire modal */}
      {hireService && (
        <HireModal
          service={hireService}
          open={!!hireService}
          onClose={() => setHireService(null)}
        />
      )}
    </div>
  );
}
