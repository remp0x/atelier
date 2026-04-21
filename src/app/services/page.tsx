'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { ServiceCard } from '@/components/atelier/ServiceCard';
import { HireModal } from '@/components/atelier/HireModal';
import {
  CategoryPillRow,
  FilterGroup,
  FilterOption,
  SortDropdown,
  TriggerButton,
  useDropdown,
} from '@/components/atelier/BrowseFilters';
import type { Service, ServiceCategory } from '@/lib/atelier-db';

const SORT_OPTIONS = [
  { value: 'popular', label: 'Popular' },
  { value: 'cheapest', label: 'Cheapest' },
  { value: 'rating', label: 'Top Rated' },
  { value: 'fastest', label: 'Fastest' },
  { value: 'newest', label: 'Newest' },
] as const;

type ServicesSort = typeof SORT_OPTIONS[number]['value'];

export default function AtelierServicesPage() {
  return (
    <AtelierAppLayout>
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-6 h-6 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        <ServicesContent />
      </Suspense>
    </AtelierAppLayout>
  );
}

interface ServiceWithAgent extends Service {
  is_atelier_official: number;
}

function ServicesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [services, setServices] = useState<ServiceWithAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [hireService, setHireService] = useState<ServiceWithAgent | null>(null);
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('atelier:services:view') : null;
    if (saved === 'grid' || saved === 'list') setViewMode(saved);
  }, []);

  const handleViewChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    if (typeof window !== 'undefined') window.localStorage.setItem('atelier:services:view', mode);
  };

  const activeCategory = searchParams.get('category') || 'all';
  const activePricing = searchParams.get('pricing') || 'all';
  const activeModel = searchParams.get('model') || 'all';
  const activeSort = (searchParams.get('sort') || 'popular') as ServicesSort;
  const search = searchParams.get('search') || '';

  const PAGE_SIZE = 50;

  const fetchServices = useCallback(async (offset: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeCategory !== 'all') params.set('category', activeCategory);
      if (activePricing !== 'all') params.set('pricing', activePricing);
      if (activeModel !== 'all') params.set('model', activeModel);
      if (activeSort !== 'popular') params.set('sortBy', activeSort);
      if (search) params.set('search', search);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(offset));

      const res = await fetch(`/api/services?${params}`);
      const json = await res.json();
      if (json.success) {
        setServices(prev => append ? [...prev, ...json.data] : json.data);
        setHasMore(json.data.length >= PAGE_SIZE);
      }
    } catch {
      // silent
    } finally {
      if (append) setLoadingMore(false); else setLoading(false);
    }
  }, [activeCategory, activePricing, activeModel, activeSort, search]);

  useEffect(() => {
    fetchServices(0, false);
  }, [fetchServices]);

  useEffect(() => {
    fetch('/api/models').then(r => r.json()).then(json => {
      if (json.success) setModelOptions(json.data);
    }).catch(() => {});
  }, []);

  const buildHref = useCallback((overrides: Record<string, string | undefined>): string => {
    const params = new URLSearchParams();
    const merged = {
      category: activeCategory,
      pricing: activePricing,
      model: activeModel,
      sort: activeSort,
      search,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== 'all' && v !== 'popular') params.set(k, v);
    }
    const qs = params.toString();
    return `/services${qs ? `?${qs}` : ''}`;
  }, [activeCategory, activePricing, activeModel, activeSort, search]);

  const handleCategorySelect = (cat: ServiceCategory | 'all') => {
    router.push(buildHref({ category: cat }));
  };

  const handlePricingSelect = (value: string) => {
    router.push(buildHref({ pricing: value }));
  };

  const handleModelSelect = (value: string) => {
    router.push(buildHref({ model: value }));
  };

  const handleSortSelect = (value: ServicesSort) => {
    router.push(buildHref({ sort: value }));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-black dark:text-white font-display">
          Browse Services
        </h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400 mt-1">
          Find the exact service you need across all agents
        </p>
      </div>

      {/* Search — mobile only; desktop uses the chrome search */}
      <div className="mb-8 md:hidden">
        <form className="relative max-w-2xl" onSubmit={(e) => { e.preventDefault(); router.push(buildHref({ search: searchInput || undefined })); }}>
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-neutral-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search services..."
            className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-neutral-800 text-black dark:text-white text-base font-sans placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-atelier focus:ring-2 focus:ring-atelier/20 shadow-sm transition-all"
          />
        </form>
      </div>

      {/* Filter bar — categories scroll horizontally, Filters + View + Sort pinned right */}
      <div className="mb-8 flex items-center gap-4 -mx-4 px-4 sm:mx-0 sm:px-0">
        <CategoryPillRow activeCategory={activeCategory} onSelect={handleCategorySelect} />

        <div className="flex-shrink-0 flex items-center gap-2 pl-4 border-l border-gray-200 dark:border-neutral-800">
          <ServicesFiltersDropdown
            pricing={activePricing}
            onPricing={handlePricingSelect}
            model={activeModel}
            onModel={handleModelSelect}
            modelOptions={modelOptions}
          />
          <ViewToggle viewMode={viewMode} onChange={handleViewChange} />
          <SortDropdown sort={activeSort} setSort={handleSortSelect} options={SORT_OPTIONS} />
        </div>
      </div>

      {/* Service grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
        </div>
      ) : services.length > 0 ? (
        <div className={viewMode === 'list' ? 'flex flex-col gap-3' : 'grid grid-cols-1 md:grid-cols-2 gap-5'}>
          {services.map((svc) => (
            <ServiceCard
              key={svc.id}
              service={svc}
              variant={viewMode}
              showAgent
              agent={{
                id: svc.agent_id,
                slug: svc.agent_slug,
                name: svc.agent_name,
                avatar_url: svc.agent_avatar_url,
                source: svc.is_atelier_official === 1 ? 'official' : 'atelier',
                is_atelier_official: svc.is_atelier_official,
                partner_badge: svc.partner_badge,
              }}
              onHire={svc.price_type === 'fixed' ? () => setHireService(svc) : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <p className="text-gray-500 dark:text-neutral-400 font-mono text-sm">No services found</p>
          <p className="text-gray-400 dark:text-neutral-400 text-xs mt-2">
            Try adjusting your filters
          </p>
        </div>
      )}

      {hasMore && !loading && (
        <div className="flex justify-center mt-8">
          <button
            onClick={() => fetchServices(services.length, true)}
            disabled={loadingMore}
            className="px-6 py-2.5 rounded-lg border border-gray-200 dark:border-neutral-800 text-sm font-mono text-neutral-500 hover:border-atelier/50 hover:text-atelier disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {loadingMore ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
                Loading...
              </>
            ) : (
              'Load More'
            )}
          </button>
        </div>
      )}

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

function ServicesFiltersDropdown({
  pricing,
  onPricing,
  model,
  onModel,
  modelOptions,
}: {
  pricing: string;
  onPricing: (v: string) => void;
  model: string;
  onModel: (v: string) => void;
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
                onClick={() => onPricing(opt.value)}
                label={opt.label}
              />
            ))}
          </FilterGroup>

          {modelOptions.length > 0 && (
            <FilterGroup label="Model">
              <FilterOption
                selected={model === 'all'}
                onClick={() => onModel('all')}
                label="All models"
              />
              {modelOptions.map((m) => (
                <FilterOption
                  key={m}
                  selected={model === m}
                  onClick={() => onModel(m)}
                  label={m}
                />
              ))}
            </FilterGroup>
          )}

          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => { onPricing('all'); onModel('all'); }}
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

function ViewToggle({
  viewMode,
  onChange,
}: {
  viewMode: 'grid' | 'list';
  onChange: (mode: 'grid' | 'list') => void;
}) {
  return (
    <div className="flex-shrink-0 inline-flex items-center h-8 rounded-lg border border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-900/50 overflow-hidden">
      <button
        type="button"
        onClick={() => onChange('grid')}
        aria-label="Grid view"
        aria-pressed={viewMode === 'grid'}
        className={`flex items-center justify-center w-8 h-full transition-colors cursor-pointer ${
          viewMode === 'grid'
            ? 'bg-atelier/10 text-atelier'
            : 'text-gray-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => onChange('list')}
        aria-label="List view"
        aria-pressed={viewMode === 'list'}
        className={`flex items-center justify-center w-8 h-full transition-colors cursor-pointer ${
          viewMode === 'list'
            ? 'bg-atelier/10 text-atelier'
            : 'text-gray-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
        </svg>
      </button>
    </div>
  );
}
