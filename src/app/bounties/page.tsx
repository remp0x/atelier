'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { BountyCard } from '@/components/atelier/BountyCard';
import { CreateBountyModal } from '@/components/atelier/CreateBountyModal';
import { CategoryPillRow, SortDropdown } from '@/components/atelier/BrowseFilters';
import type { BountyListItem, ServiceCategory } from '@/lib/atelier-db';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'budget_desc', label: 'Highest Budget' },
  { value: 'deadline_asc', label: 'Ending Soon' },
  { value: 'claims_count', label: 'Most Claims' },
] as const;

type BountiesSort = typeof SORT_OPTIONS[number]['value'];

export default function BountiesPage() {
  return (
    <AtelierAppLayout>
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-6 h-6 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        <BountiesContent />
      </Suspense>
    </AtelierAppLayout>
  );
}

function BountiesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [bounties, setBounties] = useState<BountyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [showCreate, setShowCreate] = useState(false);

  const activeCategory = searchParams.get('category') || 'all';
  const activeSort = (searchParams.get('sort') || 'newest') as BountiesSort;
  const PAGE_SIZE = 20;

  const fetchBounties = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('status', 'open');
      if (activeCategory !== 'all') params.set('category', activeCategory);
      if (activeSort !== 'newest') params.set('sort', activeSort);
      params.set('limit', String(PAGE_SIZE));

      const res = await fetch(`/api/bounties?${params}`);
      const json = await res.json();
      if (json.success) {
        setBounties(json.data);
        setTotal(json.total);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [activeCategory, activeSort]);

  useEffect(() => {
    fetchBounties();
  }, [fetchBounties]);

  const buildHref = useCallback((overrides: Record<string, string | undefined>): string => {
    const params = new URLSearchParams();
    const merged = { category: activeCategory, sort: activeSort, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== 'all' && v !== 'newest') params.set(k, v);
    }
    const qs = params.toString();
    return `/bounties${qs ? `?${qs}` : ''}`;
  }, [activeCategory, activeSort]);

  const handleCategorySelect = (cat: ServiceCategory | 'all') => {
    router.push(buildHref({ category: cat }));
  };

  const handleSortSelect = (value: BountiesSort) => {
    router.push(buildHref({ sort: value }));
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-black dark:text-white font-display">
            Bounties
          </h1>
          <p className="text-sm text-gray-500 dark:text-neutral-400 mt-1">
            Post a task, set your budget — agents compete to deliver
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold font-mono bg-atelier text-white hover:bg-atelier/90 transition-colors shrink-0"
        >
          Post a Bounty
        </button>
      </div>

      {/* Filter bar — categories scroll horizontally, Sort pinned right */}
      <div className="mb-8 flex items-center gap-4 -mx-4 px-4 sm:mx-0 sm:px-0">
        <CategoryPillRow activeCategory={activeCategory} onSelect={handleCategorySelect} />

        <div className="flex-shrink-0 flex items-center gap-2 pl-4 border-l border-gray-200 dark:border-neutral-800">
          <SortDropdown sort={activeSort} setSort={handleSortSelect} options={SORT_OPTIONS} />
        </div>
      </div>

      {total > 0 && !loading && (
        <div className="mb-4 text-xs text-gray-400 dark:text-neutral-400 font-mono">
          {total} {total === 1 ? 'bounty' : 'bounties'}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
        </div>
      ) : bounties.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bounties.map((bounty) => (
            <BountyCard key={bounty.id} bounty={bounty} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <p className="text-gray-500 dark:text-neutral-400 font-mono text-sm">No open bounties</p>
          <p className="text-gray-400 dark:text-neutral-400 text-xs mt-2">
            Be the first to post one
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 px-5 py-2.5 rounded-xl text-sm font-semibold font-mono bg-atelier text-white hover:bg-atelier/90 transition-colors"
          >
            Post a Bounty
          </button>
        </div>
      )}

      <CreateBountyModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={fetchBounties}
      />
    </div>
  );
}
