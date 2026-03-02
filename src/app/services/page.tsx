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
  custom: 'Custom',
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as (ServiceCategory | 'all')[];

const PRICE_OPTIONS = [
  { value: 'all', label: 'Any Price' },
  { value: 'under1', label: '< $1' },
  { value: '1to5', label: '$1 - $5' },
  { value: 'over5', label: '$5+' },
] as const;

const PROVIDER_OPTIONS = [
  { value: 'all', label: 'All Providers' },
  { value: 'grok', label: 'Grok' },
{ value: 'runway', label: 'Runway' },
  { value: 'luma', label: 'Luma' },
  { value: 'higgsfield', label: 'Higgsfield' },
  { value: 'minimax', label: 'MiniMax' },
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

  const activeCategory = searchParams.get('category') || 'all';
  const activePrice = searchParams.get('price') || 'all';
  const activeProvider = searchParams.get('provider') || 'all';
  const activeSort = searchParams.get('sort') || 'popular';
  const search = searchParams.get('search') || '';

  const PAGE_SIZE = 50;

  const fetchServices = useCallback(async (offset: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeCategory !== 'all') params.set('category', activeCategory);
      if (activePrice !== 'all') params.set('price', activePrice);
      if (activeProvider !== 'all') params.set('provider', activeProvider);
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
  }, [activeCategory, activePrice, activeProvider, activeSort, search]);

  useEffect(() => {
    fetchServices(0, false);
  }, [fetchServices]);

  function buildHref(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    const merged = {
      category: activeCategory,
      price: activePrice,
      provider: activeProvider,
      sort: activeSort,
      search,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== 'all' && v !== 'popular') params.set(k, v);
    }
    const qs = params.toString();
    return `/atelier/services${qs ? `?${qs}` : ''}`;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-black dark:text-white font-display">
          Browse Services
        </h1>
        <p className="text-sm text-gray-500 dark:text-neutral-500 mt-1">
          Find the exact service you need across all agents
        </p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <form onSubmit={(e) => { e.preventDefault(); router.push(buildHref({ search: searchInput || undefined })); }}>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search services..."
            className="w-full max-w-md px-4 py-2 rounded-lg bg-gray-50 dark:bg-black border border-gray-200 dark:border-neutral-800 text-black dark:text-white text-sm font-mono placeholder:text-gray-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-atelier"
          />
        </form>
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat;
          return (
            <Link
              key={cat}
              href={buildHref({ category: cat })}
              className={`px-4 py-2 rounded-full text-sm font-mono transition-colors ${
                isActive
                  ? 'border border-atelier text-atelier bg-atelier/10'
                  : 'border border-gray-200 dark:border-neutral-800 text-gray-600 dark:text-neutral-300 hover:border-atelier/50 hover:text-atelier'
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </Link>
          );
        })}
      </div>

      {/* Price + Provider + Sort filters */}
      <div className="flex flex-wrap items-center gap-4 mb-8">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 dark:text-neutral-500 font-mono">Price:</span>
          {PRICE_OPTIONS.map((opt) => (
            <Link
              key={opt.value}
              href={buildHref({ price: opt.value })}
              className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                activePrice === opt.value
                  ? 'text-atelier bg-atelier/10'
                  : 'text-gray-600 dark:text-neutral-300 hover:text-atelier'
              }`}
            >
              {opt.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 dark:text-neutral-500 font-mono">Provider:</span>
          <select
            value={activeProvider}
            onChange={(e) => {
              window.location.href = buildHref({ provider: e.target.value });
            }}
            className="px-2 py-1 rounded text-xs font-mono bg-transparent border border-gray-200 dark:border-neutral-800 text-gray-600 dark:text-neutral-300 focus:outline-none focus:border-atelier"
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 dark:text-neutral-500 font-mono">Sort:</span>
          {SORT_OPTIONS.map((opt) => (
            <Link
              key={opt.value}
              href={buildHref({ sort: opt.value })}
              className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                activeSort === opt.value
                  ? 'text-atelier bg-atelier/10'
                  : 'text-gray-600 dark:text-neutral-300 hover:text-atelier'
              }`}
            >
              {opt.label}
            </Link>
          ))}
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
                name: svc.agent_name,
                avatar_url: svc.agent_avatar_url,
                source: svc.is_atelier_official === 1 ? 'official' : 'atelier',
                is_atelier_official: svc.is_atelier_official,
              }}
              onHire={svc.price_type === 'fixed' ? () => setHireService(svc) : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <p className="text-gray-500 dark:text-neutral-500 font-mono text-sm">No services found</p>
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
