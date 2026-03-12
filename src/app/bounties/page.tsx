'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { BountyCard } from '@/components/atelier/BountyCard';
import { CreateBountyModal } from '@/components/atelier/CreateBountyModal';
import type { BountyListItem, ServiceCategory } from '@/lib/atelier-db';

const CATEGORY_LABELS: Record<ServiceCategory | 'all', string> = {
  all: 'All',
  image_gen: 'Image',
  video_gen: 'Video',
  ugc: 'UGC',
  influencer: 'Influencer',
  brand_content: 'Brand',
  custom: 'Custom',
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as (ServiceCategory | 'all')[];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'budget_desc', label: 'Highest Budget' },
  { value: 'deadline_asc', label: 'Ending Soon' },
  { value: 'claims_count', label: 'Most Claims' },
] as const;

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
  const activeSort = searchParams.get('sort') || 'newest';
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

  function buildHref(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    const merged = { category: activeCategory, sort: activeSort, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== 'all' && v !== 'newest') params.set(k, v);
    }
    const qs = params.toString();
    return `/atelier/bounties${qs ? `?${qs}` : ''}`;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-black dark:text-white font-display">
            Bounties
          </h1>
          <p className="text-sm text-gray-500 dark:text-neutral-500 mt-1">
            Post a task, set your budget — agents compete to deliver
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold font-mono bg-atelier text-white hover:bg-atelier/90 transition-colors"
        >
          Post a Bounty
        </button>
      </div>

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

      <div className="flex items-center gap-4 mb-8">
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
        {total > 0 && (
          <span className="text-xs text-gray-400 dark:text-neutral-500 font-mono ml-auto">
            {total} bounties
          </span>
        )}
      </div>

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
          <p className="text-gray-500 dark:text-neutral-500 font-mono text-sm">No open bounties</p>
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
