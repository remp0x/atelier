'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { ServiceCard } from '@/components/atelier/ServiceCard';
import { HireModal } from '@/components/atelier/HireModal';
import type { Service, ServiceCategory } from '@/lib/atelier-db';

const CATEGORY_LABELS: Record<ServiceCategory | 'all', string> = {
  all: 'All',
  image_gen: 'Image Gen',
  video_gen: 'Video Gen',
  ugc: 'UGC',
  influencer: 'Influencer',
  brand_content: 'Brand',
  coding: 'Coding',
  analytics: 'Analytics',
  seo: 'SEO',
  trading: 'Trading',
  automation: 'Automation',
  consulting: 'Consulting',
  custom: 'Custom',
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as (ServiceCategory | 'all')[];

const PRICING_OPTIONS = [
  { value: 'all', label: 'All pricing' },
  { value: 'onetime', label: 'One-time' },
  { value: 'subscription', label: 'Subscription' },
] as const;

const SORT_OPTIONS = [
  { value: 'popular', label: 'Popular' },
  { value: 'cheapest', label: 'Cheapest' },
  { value: 'rating', label: 'Top Rated' },
  { value: 'fastest', label: 'Fastest' },
  { value: 'newest', label: 'Newest' },
] as const;

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

  const activeCategory = searchParams.get('category') || 'all';
  const activePricing = searchParams.get('pricing') || 'all';
  const activeModel = searchParams.get('model') || 'all';
  const activeSort = searchParams.get('sort') || 'popular';
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

  function buildHref(overrides: Record<string, string | undefined>): string {
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
  }

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

      {/* Search */}
      <div className="mb-6">
        <form className="relative max-w-sm" onSubmit={(e) => { e.preventDefault(); router.push(buildHref({ search: searchInput || undefined })); }}>
          <svg className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search services..."
            className="w-full pl-6 pr-2 py-1.5 bg-transparent border-b border-gray-200 dark:border-neutral-800 text-black dark:text-white text-sm font-mono placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-atelier transition-colors"
          />
        </form>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-y-3 mb-8 border-b border-gray-100 dark:border-neutral-700/50">
        <div className="flex items-center gap-x-1 mr-6">
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat;
            return (
              <Link
                key={cat}
                href={buildHref({ category: cat })}
                className={`relative px-3 py-2 text-xs font-mono transition-colors ${
                  isActive
                    ? 'text-atelier'
                    : 'text-gray-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
                }`}
              >
                {CATEGORY_LABELS[cat]}
                {isActive && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4/5 h-0.5 bg-atelier rounded-full" />
                )}
              </Link>
            );
          })}
        </div>

        <span className="hidden sm:block w-px h-4 bg-gray-200 dark:bg-neutral-800 mr-6" />

        <div className="flex items-center gap-x-1 mr-6">
          {PRICING_OPTIONS.map((opt) => {
            const isActive = activePricing === opt.value;
            return (
              <Link
                key={opt.value}
                href={buildHref({ pricing: opt.value })}
                className={`relative px-3 py-2 text-xs font-mono transition-colors ${
                  isActive
                    ? 'text-atelier'
                    : 'text-gray-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
                }`}
              >
                {opt.label}
                {isActive && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4/5 h-0.5 bg-atelier rounded-full" />
                )}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-x-4 ml-auto pb-2">
          {modelOptions.length > 0 && (
            <label className="relative inline-flex items-center gap-1 cursor-pointer group">
              <select
                value={activeModel}
                onChange={(e) => {
                  router.push(buildHref({ model: e.target.value }));
                }}
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
              value={activeSort}
              onChange={(e) => {
                router.push(buildHref({ sort: e.target.value }));
              }}
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

      {/* Service grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
        </div>
      ) : services.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {services.map((svc) => (
            <ServiceCard
              key={svc.id}
              service={svc}
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
