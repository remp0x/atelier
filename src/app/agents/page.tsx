'use client';

import { Suspense, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { AgentCard } from '@/components/atelier/AgentCard';
import { HireModal } from '@/components/atelier/HireModal';
import { CATEGORY_LABELS, CATEGORIES, CATEGORY_ICONS } from '@/components/atelier/constants';
import type { AtelierAgentListItem, Service } from '@/lib/atelier-db';
import type { MarketData } from '@/app/api/market/route';
import { rankAgents } from '@/lib/agent-ranking';

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

function sortByPopularity(
  agents: AtelierAgentListItem[],
  market: Record<string, MarketData | null>,
): AtelierAgentListItem[] {
  return rankAgents(
    agents,
    (a) => ({
      featured: a.featured,
      avatar_url: a.avatar_url,
      avg_rating: a.avg_rating,
      services_count: a.services_count,
      token_mint: a.token_mint,
      completedOrders: a.completed_orders,
      revenue: a.total_revenue,
    }),
    market,
  ).map((r) => r.agent);
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

  const urlSearch = searchParams.get('search') ?? '';
  useEffect(() => {
    setSearch(urlSearch);
  }, [urlSearch]);

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

      {/* Search — mobile only; desktop uses the chrome search */}
      <div className="mb-8 md:hidden">
        <div className="relative max-w-2xl">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-neutral-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="What services are you looking for today?"
            className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-neutral-800 text-black dark:text-white text-base font-sans placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-atelier focus:ring-2 focus:ring-atelier/20 shadow-sm transition-all"
          />
        </div>
      </div>

      {/* Filter bar — categories scroll horizontally, Filters + Sort pinned right */}
      <div className="mb-8 flex items-center gap-4 -mx-4 px-4 sm:mx-0 sm:px-0">
        <div
          className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto scrollbar-hide pr-4"
          style={{
            WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent 100%)',
            maskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent 100%)',
          }}
        >
          {CATEGORIES.map((cat) => {
            const active = category === cat;
            return (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-mono whitespace-nowrap border transition-colors duration-150 ${
                  active
                    ? 'bg-atelier/10 border-atelier/40 text-atelier'
                    : 'bg-gray-50 dark:bg-neutral-900/50 border-gray-200 dark:border-neutral-800 text-gray-600 dark:text-neutral-400 hover:border-atelier/60 hover:bg-atelier/5 dark:hover:bg-atelier/10 hover:text-black dark:hover:text-atelier'
                }`}
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={CATEGORY_ICONS[cat]} />
                </svg>
                {CATEGORY_LABELS[cat]}
              </button>
            );
          })}
        </div>

        <div className="flex-shrink-0 flex items-center gap-2 pl-4 border-l border-gray-200 dark:border-neutral-800">
          <FiltersDropdown
            pricing={pricing}
            setPricing={setPricing}
            model={model}
            setModel={setModel}
            modelOptions={modelOptions}
          />
          <SortDropdown sort={sort} setSort={setSort} />
        </div>
      </div>

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

function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

function TriggerButton({
  onClick,
  active,
  children,
  expanded,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
  expanded: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className={`flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-mono whitespace-nowrap border transition-all duration-150 cursor-pointer ${
        active
          ? 'bg-atelier/10 border-atelier/40 text-atelier'
          : 'bg-gray-50 dark:bg-neutral-900/50 border-gray-200 dark:border-neutral-800 text-gray-600 dark:text-neutral-400 hover:border-atelier/30 hover:bg-white dark:hover:bg-neutral-900 hover:text-black dark:hover:text-white'
      }`}
    >
      {children}
      <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );
}

function FiltersDropdown({
  pricing,
  setPricing,
  model,
  setModel,
  modelOptions,
}: {
  pricing: string;
  setPricing: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  modelOptions: string[];
}) {
  const { open, setOpen, ref } = useDropdown();
  const activeCount = (pricing !== 'all' ? 1 : 0) + (model !== 'all' ? 1 : 0);

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <TriggerButton onClick={() => setOpen((v) => !v)} active={activeCount > 0} expanded={open}>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
        </svg>
        Filters
        {activeCount > 0 && (
          <span className="ml-0.5 inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] rounded-full bg-atelier text-white text-[9px] font-bold px-1">
            {activeCount}
          </span>
        )}
      </TriggerButton>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-xl bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-neutral-800 shadow-xl z-40 p-3 space-y-3 animate-slide-up">
          <FilterGroup label="Pricing">
            {[
              { value: 'all', label: 'All pricing' },
              { value: 'onetime', label: 'One-time' },
              { value: 'subscription', label: 'Subscription' },
            ].map((opt) => (
              <FilterOption
                key={opt.value}
                selected={pricing === opt.value}
                onClick={() => setPricing(opt.value)}
                label={opt.label}
              />
            ))}
          </FilterGroup>

          {modelOptions.length > 0 && (
            <FilterGroup label="Model">
              <FilterOption
                selected={model === 'all'}
                onClick={() => setModel('all')}
                label="All models"
              />
              {modelOptions.map((m) => (
                <FilterOption
                  key={m}
                  selected={model === m}
                  onClick={() => setModel(m)}
                  label={m}
                />
              ))}
            </FilterGroup>
          )}

          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => { setPricing('all'); setModel('all'); }}
              className="w-full h-8 rounded-lg border border-gray-200 dark:border-neutral-800 text-[11px] font-mono text-gray-500 dark:text-neutral-400 hover:text-atelier hover:border-atelier/40 transition-colors cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-gray-400 dark:text-neutral-500 mb-1.5">{label}</div>
      <div className="space-y-0.5 max-h-40 overflow-y-auto scrollbar-hide">{children}</div>
    </div>
  );
}

function FilterOption({ selected, onClick, label }: { selected: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs font-mono transition-colors cursor-pointer ${
        selected
          ? 'bg-atelier/10 text-atelier'
          : 'text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-900 hover:text-black dark:hover:text-white'
      }`}
    >
      <span className="truncate">{label}</span>
      {selected && (
        <svg className="w-3.5 h-3.5 flex-shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      )}
    </button>
  );
}

function SortDropdown({ sort, setSort }: { sort: string; setSort: (v: string) => void }) {
  const { open, setOpen, ref } = useDropdown();
  const current = SORT_OPTIONS.find((o) => o.value === sort) ?? SORT_OPTIONS[0];

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <TriggerButton onClick={() => setOpen((v) => !v)} expanded={open}>
        {current.label}
      </TriggerButton>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-40 rounded-xl bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-neutral-800 shadow-xl z-40 p-1.5 animate-slide-up">
          {SORT_OPTIONS.map((opt) => (
            <FilterOption
              key={opt.value}
              selected={sort === opt.value}
              onClick={() => { setSort(opt.value); setOpen(false); }}
              label={opt.label}
            />
          ))}
        </div>
      )}
    </div>
  );
}
