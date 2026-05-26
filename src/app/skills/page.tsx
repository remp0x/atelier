'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import {
  POPULAR_SKILL_NAMES,
  SKILL_CATEGORIES,
  SKILL_EXAMPLES,
  SKILL_PACKS,
  type SkillExample,
  type SkillPackId,
} from '@/components/atelier/market/marketData';
import { PublishSkillModal } from '@/components/atelier/market/PublishSkillModal';

const COMMUNITY_CATEGORY_SLUG = 'community';
const COMMUNITY_CATEGORY_NAME = 'Community';

const CATEGORY_ICON: Record<string, string> = {
  all: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
  community: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
  medical: 'M11.412 15.655L9.75 21.75l3.745-4.012M9.257 13.5H3.75l2.659-2.849m2.048-2.194L14.25 2.25 12 10.5h8.25l-4.707 5.043M8.457 8.457L3 3m5.457 5.457l7.086 7.086m0 0L21 21',
  research: 'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5',
  writing: 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10',
  coding: 'M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5',
  growth: 'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941',
  sales: 'M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z',
  design: 'M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42',
  data: 'M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125',
  ops: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a6.759 6.759 0 010 .255c-.008.378.137.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z',
  support: 'M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z',
};

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'A → Z' },
  { value: 'pack', label: 'By Pack' },
  { value: 'cheapest', label: 'Cheapest' },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]['value'];

const PACK_IDS = (Object.keys(SKILL_PACKS) as SkillPackId[]).filter(
  (id) => !SKILL_PACKS[id].external,
);

export default function SkillsBrowsePage() {
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
  const [sort, setSort] = useState<SortValue>(
    (SORT_OPTIONS.find(o => o.value === searchParams.get('sort'))?.value as SortValue) || 'name',
  );
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [pricing, setPricing] = useState(searchParams.get('pricing') || 'all');
  const [pack, setPack] = useState(searchParams.get('pack') || 'all');

  const [visibleCount, setVisibleCount] = useState(48);
  const [communitySkills, setCommunitySkills] = useState<SkillExample[]>([]);
  const [publishOpen, setPublishOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/skills/community')
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success) setCommunitySkills(json.data as SkillExample[]);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const allSkills = useMemo<SkillExample[]>(
    () => [...communitySkills, ...SKILL_EXAMPLES],
    [communitySkills],
  );

  const urlSearch = searchParams.get('search') ?? '';
  useEffect(() => {
    setSearch(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    if (window.location.search.includes('privy')) return;
    const params = new URLSearchParams();
    if (category !== 'all') params.set('category', category);
    if (sort !== 'name') params.set('sort', sort);
    if (search) params.set('search', search);
    if (pricing !== 'all') params.set('pricing', pricing);
    if (pack !== 'all') params.set('pack', pack);
    const qs = params.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    window.history.replaceState(null, '', url);
  }, [category, sort, search, pricing, pack]);

  const filteredSkills = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matches = allSkills.filter((skill) => {
      if (category === COMMUNITY_CATEGORY_SLUG) {
        if (skill.pack !== 'community') return false;
      } else if (category !== 'all') {
        const slug = SKILL_CATEGORIES.find(c => c.slug === category);
        if (!slug) return false;
        if (skill.category.toLowerCase() !== slug.name.toLowerCase()) return false;
      }
      if (pack !== 'all' && skill.pack !== pack) return false;
      const price = skill.price ?? 0;
      if (pricing === 'free' && price > 0) return false;
      if (pricing === 'paid' && price <= 0) return false;
      if (term) {
        const hay = `${skill.name} ${skill.tagline} ${skill.tools.join(' ')} ${skill.kb}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });

    const sorted = [...matches];
    if (sort === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === 'pack') {
      sorted.sort((a, b) => (a.pack === b.pack ? a.name.localeCompare(b.name) : a.pack.localeCompare(b.pack)));
    } else if (sort === 'cheapest') {
      sorted.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    } else if (sort === 'newest') {
      // Skills with a created_at (community submissions) sort newest-first.
      // Curated skills have no timestamp and fall to the bottom, alphabetical.
      sorted.sort((a, b) => {
        const ta = a.created_at ? Date.parse(a.created_at) : 0;
        const tb = b.created_at ? Date.parse(b.created_at) : 0;
        if (ta !== tb) return tb - ta;
        return a.name.localeCompare(b.name);
      });
    }
    return sorted;
  }, [category, search, pricing, pack, sort, allSkills]);

  useEffect(() => {
    setVisibleCount(48);
  }, [category, search, pricing, pack, sort]);

  const visibleSkills = filteredSkills.slice(0, visibleCount);
  const hasMore = visibleCount < filteredSkills.length;

  const categoryChips = useMemo(
    () => ['all', COMMUNITY_CATEGORY_SLUG, ...SKILL_CATEGORIES.map((c) => c.slug)],
    [],
  );
  const categoryLabel = (slug: string) => {
    if (slug === 'all') return 'All';
    if (slug === COMMUNITY_CATEGORY_SLUG) return COMMUNITY_CATEGORY_NAME;
    return SKILL_CATEGORIES.find((c) => c.slug === slug)?.name ?? slug;
  };

  const noFilters =
    category === 'all' && !search && pricing === 'all' && pack === 'all';

  const popularSkills = useMemo(() => {
    const byName = new Map(allSkills.map((s) => [s.name, s]));
    const curated = POPULAR_SKILL_NAMES
      .map((n) => byName.get(n))
      .filter((s): s is SkillExample => Boolean(s));
    const community = allSkills.filter((s) => s.pack === 'community');

    // Dedupe (community + curated) preserving insertion order.
    const seen = new Set<string>();
    const merged: SkillExample[] = [];
    for (const s of [...community, ...curated]) {
      const key = `${s.pack}:${s.slug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(s);
    }

    // Sort by:
    //  1. community before non-community (community always first)
    //  2. within each group, paid before free
    //  3. stable on original order otherwise (Array.prototype.sort is stable)
    const isCommunity = (s: SkillExample) => s.pack === 'community';
    const isPaid = (s: SkillExample) => (s.price ?? 0) > 0;
    return merged.sort((a, b) => {
      if (isCommunity(a) !== isCommunity(b)) return isCommunity(a) ? -1 : 1;
      if (isPaid(a) !== isPaid(b)) return isPaid(a) ? -1 : 1;
      return 0;
    });
  }, [allSkills]);

  const featuredRows = useMemo(() => {
    const pick = (cat: string, limit = 10) =>
      allSkills.filter((s) => s.category.toLowerCase() === cat.toLowerCase()).slice(0, limit);
    return [
      { title: 'Coding & Engineering', slug: 'coding', skills: pick('Coding', 10) },
      { title: 'Design & Content', slug: 'design', skills: pick('Design', 10) },
      { title: 'Research & Data', slug: 'research', skills: pick('Research', 10) },
    ].filter((r) => r.skills.length >= 4);
  }, [allSkills]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-black dark:text-white font-display">
            Browse Skills
          </h1>
          <p className="text-sm text-gray-500 dark:text-neutral-400 mt-1">
            Install a workflow in one click. Free and paid.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPublishOpen(true)}
          className="flex-shrink-0 inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-atelier/10 border border-atelier/30 text-atelier font-semibold text-sm font-mono hover:bg-atelier/15 hover:border-atelier/50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Sell a Skill
        </button>
      </div>

      <PublishSkillModal open={publishOpen} onClose={() => setPublishOpen(false)} />

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
            placeholder="Search skills, tools, or knowledge..."
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
          {categoryChips.map((slug) => {
            const active = category === slug;
            return (
              <button
                key={slug}
                onClick={() => setCategory(slug)}
                className={`flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-mono whitespace-nowrap border transition-colors duration-150 ${
                  active
                    ? 'bg-atelier/10 border-atelier/40 text-atelier'
                    : 'bg-gray-50 dark:bg-neutral-900/50 border-gray-200 dark:border-neutral-800 text-gray-600 dark:text-neutral-400 hover:border-atelier/60 hover:bg-atelier/5 dark:hover:bg-atelier/10 hover:text-black dark:hover:text-atelier'
                }`}
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={CATEGORY_ICON[slug] ?? CATEGORY_ICON.all} />
                </svg>
                {categoryLabel(slug)}
              </button>
            );
          })}
        </div>

        <div className="flex-shrink-0 flex items-center gap-2 pl-4 border-l border-gray-200 dark:border-neutral-800">
          <FiltersDropdown
            pricing={pricing}
            setPricing={setPricing}
            pack={pack}
            setPack={setPack}
          />
          <SortDropdown sort={sort} setSort={setSort} />
        </div>
      </div>

      {/* Featured rows (shown when no filters applied) */}
      {noFilters && (
        <div className="space-y-10 mb-12">
          <SkillRow
            title="Most Popular Skills"
            subtitle="Hand-picked workflows operators ship with daily"
            skills={popularSkills}
          />
          {featuredRows.map((row) => (
            <SkillRow
              key={row.slug}
              title={`Skills · ${row.title}`}
              onSeeAll={() => setCategory(row.slug)}
              skills={row.skills}
            />
          ))}
        </div>
      )}

      {noFilters && (
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="font-display font-bold text-lg text-black dark:text-white">All Skills</h2>
          <span className="text-2xs font-mono text-gray-500 dark:text-neutral-500">
            {filteredSkills.length} total
          </span>
        </div>
      )}

      {/* Skill grid */}
      {visibleSkills.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleSkills.map((skill) => (
            <SkillCard key={`${skill.pack}-${skill.slug}`} skill={skill} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <p className="text-gray-500 dark:text-neutral-400 font-mono text-sm">No skills found</p>
          <p className="text-gray-400 dark:text-neutral-400 text-xs mt-2">
            Try a different category or clear filters
          </p>
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center mt-8">
          <button
            onClick={() => setVisibleCount(prev => prev + 48)}
            className="px-6 py-2.5 rounded-lg border border-gray-200 dark:border-neutral-800 text-sm font-mono text-neutral-500 hover:border-atelier/50 hover:text-atelier transition-colors"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}

function SkillRow({
  title,
  subtitle,
  skills,
  onSeeAll,
}: {
  title: string;
  subtitle?: string;
  skills: SkillExample[];
  onSeeAll?: () => void;
}) {
  if (skills.length === 0) return null;
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-lg text-black dark:text-white">
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs text-gray-500 dark:text-neutral-500 mt-0.5">{subtitle}</p>
          )}
        </div>
        {onSeeAll && (
          <button
            type="button"
            onClick={onSeeAll}
            className="text-2xs font-mono text-gray-500 dark:text-neutral-500 hover:text-atelier transition-colors flex-shrink-0"
          >
            See all →
          </button>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory -mx-4 px-4 sm:mx-0 sm:px-0">
        {skills.map((skill) => (
          <div
            key={`${skill.pack}-${skill.slug}-row`}
            className="w-[260px] sm:w-[300px] flex-shrink-0 snap-start"
          >
            <SkillCard skill={skill} />
          </div>
        ))}
      </div>
    </section>
  );
}

function SkillCard({ skill }: { skill: SkillExample }) {
  const isFree = (skill.price ?? 0) === 0;
  const price = skill.price ?? 0;
  const ctaLabel = isFree ? 'Get free' : `Get for $${price.toFixed(price % 1 === 0 ? 0 : 2)}`;
  const href = `/skills/${skill.pack}/${skill.slug}`;

  return (
    <Link
      href={href}
      className="group p-5 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800 hover:border-atelier/40 dark:hover:border-atelier/40 transition-all duration-200 flex flex-col"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full font-mono text-[10px] tracking-[0.14em] text-atelier border border-atelier/50 bg-atelier/10">
          {skill.category.toUpperCase()}
        </span>
        <span className={`font-mono text-[11px] tracking-wider uppercase ${isFree ? 'text-atelier' : 'text-black dark:text-white'}`}>
          {isFree ? 'FREE' : `$${price.toFixed(price % 1 === 0 ? 0 : 2)}`}
        </span>
      </div>

      <h3 className="font-semibold font-display text-black dark:text-white text-base leading-snug mb-1.5">
        {skill.name}
      </h3>
      <p className="text-sm text-gray-500 dark:text-neutral-400 mb-4 line-clamp-2">
        {skill.tagline}
      </p>

      <div className="mt-auto flex items-center justify-end pt-3 border-t border-gray-200 dark:border-neutral-800/50">
        <span className="px-4 py-1.5 rounded border border-atelier text-atelier text-xs font-medium font-mono transition-all duration-200 group-hover:bg-atelier group-hover:text-white">
          {ctaLabel}
        </span>
      </div>
    </Link>
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
  pack,
  setPack,
}: {
  pricing: string;
  setPricing: (v: string) => void;
  pack: string;
  setPack: (v: string) => void;
}) {
  const { open, setOpen, ref } = useDropdown();
  const activeCount = (pricing !== 'all' ? 1 : 0) + (pack !== 'all' ? 1 : 0);

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
              { value: 'free', label: 'Free' },
              { value: 'paid', label: 'Paid' },
            ].map((opt) => (
              <FilterOption
                key={opt.value}
                selected={pricing === opt.value}
                onClick={() => setPricing(opt.value)}
                label={opt.label}
              />
            ))}
          </FilterGroup>

          <FilterGroup label="Pack">
            <FilterOption
              selected={pack === 'all'}
              onClick={() => setPack('all')}
              label="All packs"
            />
            {PACK_IDS.map((id) => (
              <FilterOption
                key={id}
                selected={pack === id}
                onClick={() => setPack(id)}
                label={SKILL_PACKS[id].label}
              />
            ))}
          </FilterGroup>

          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => { setPricing('all'); setPack('all'); }}
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

function SortDropdown({ sort, setSort }: { sort: SortValue; setSort: (v: SortValue) => void }) {
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
