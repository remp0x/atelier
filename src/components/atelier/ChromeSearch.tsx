'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { atelierHref } from '@/lib/atelier-paths';
import type { AtelierAgentListItem, Service } from '@/lib/atelier-db';
import { SKILL_EXAMPLES, type SkillExample } from '@/components/atelier/market/marketData';

const AGENTS_PATH = atelierHref('/atelier/agents');
const SERVICES_PATH = '/services';
const SKILLS_PATH = '/skills';
const MIN_QUERY_LEN = 2;
const PER_GROUP_LIMIT = 4;

type Suggestion =
  | { kind: 'agent'; data: AtelierAgentListItem }
  | { kind: 'service'; data: Service }
  | { kind: 'skill'; data: SkillExample };

function suggestionHref(s: Suggestion): string {
  if (s.kind === 'agent') return atelierHref(`/atelier/agents/${s.data.slug}`);
  if (s.kind === 'service') return `${SERVICES_PATH}?search=${encodeURIComponent(s.data.title)}`;
  return `${SKILLS_PATH}/${s.data.pack}/${s.data.slug}`;
}

function searchSkills(term: string, limit: number): SkillExample[] {
  const q = term.toLowerCase();
  const out: SkillExample[] = [];
  for (const skill of SKILL_EXAMPLES) {
    if (
      skill.name.toLowerCase().includes(q) ||
      skill.tagline.toLowerCase().includes(q) ||
      skill.category.toLowerCase().includes(q) ||
      skill.tools.some((t) => t.toLowerCase().includes(q))
    ) {
      out.push(skill);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export function ChromeSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlSearch = searchParams?.get('search') ?? '';
  const [value, setValue] = useState(urlSearch);
  const [agents, setAgents] = useState<AtelierAgentListItem[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [skills, setSkills] = useState<SkillExample[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setValue(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed.length < MIN_QUERY_LEN) {
      setAgents([]);
      setServices([]);
      setSkills([]);
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const handle = setTimeout(() => {
      setLoading(true);
      const q = encodeURIComponent(trimmed);
      Promise.all([
        fetch(`/api/agents?search=${q}&limit=${PER_GROUP_LIMIT}`, { signal: ctrl.signal })
          .then((r) => r.json())
          .then((res) => (res?.success && Array.isArray(res.data) ? res.data : []))
          .catch((err) => {
            if (err.name !== 'AbortError') return [];
            throw err;
          }),
        fetch(`/api/services?search=${q}&limit=${PER_GROUP_LIMIT}`, { signal: ctrl.signal })
          .then((r) => r.json())
          .then((res) => (res?.success && Array.isArray(res.data) ? res.data : []))
          .catch((err) => {
            if (err.name !== 'AbortError') return [];
            throw err;
          }),
      ])
        .then(([a, s]) => {
          setAgents((a as AtelierAgentListItem[]).slice(0, PER_GROUP_LIMIT));
          setServices((s as Service[]).slice(0, PER_GROUP_LIMIT));
          setSkills(searchSkills(trimmed, PER_GROUP_LIMIT));
        })
        .catch((err) => {
          if (err?.name !== 'AbortError') {
            setAgents([]);
            setServices([]);
            setSkills(searchSkills(trimmed, PER_GROUP_LIMIT));
          }
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });
    }, 180);

    return () => {
      clearTimeout(handle);
      ctrl.abort();
    };
  }, [value]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const flatSuggestions = useMemo<Suggestion[]>(() => [
    ...agents.map((a) => ({ kind: 'agent' as const, data: a })),
    ...services.map((s) => ({ kind: 'service' as const, data: s })),
    ...skills.map((s) => ({ kind: 'skill' as const, data: s })),
  ], [agents, services, skills]);

  const onAgentsBrowse = pathname === AGENTS_PATH;

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (onAgentsBrowse) {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (trimmed) params.set('search', trimmed);
      else params.delete('search');
      const qs = params.toString();
      router.replace(`${AGENTS_PATH}${qs ? `?${qs}` : ''}`);
    } else {
      const qs = trimmed ? `?search=${encodeURIComponent(trimmed)}` : '';
      router.push(`${AGENTS_PATH}${qs}`);
    }
    setOpen(false);
  }, [value, onAgentsBrowse, searchParams, router]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const showDropdown =
      open && value.trim().length >= MIN_QUERY_LEN && (loading || flatSuggestions.length > 0);

    if (e.key === 'Escape') {
      if (showDropdown) {
        setOpen(false);
        return;
      }
      setValue('');
      if (onAgentsBrowse) {
        const params = new URLSearchParams(searchParams?.toString() ?? '');
        params.delete('search');
        const qs = params.toString();
        router.replace(`${AGENTS_PATH}${qs ? `?${qs}` : ''}`);
      }
      return;
    }

    if (!showDropdown || flatSuggestions.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((prev) => (prev + 1) % flatSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((prev) => (prev <= 0 ? flatSuggestions.length - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = flatSuggestions[highlighted];
      if (target) {
        router.push(suggestionHref(target));
        setOpen(false);
      } else {
        submit();
      }
    }
  };

  const showDropdown =
    open && value.trim().length >= MIN_QUERY_LEN && (loading || flatSuggestions.length > 0);

  let runningIndex = 0;
  const indexFor = () => runningIndex++;

  return (
    <div ref={containerRef} className="relative flex-1 max-w-2xl z-20">
      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        role="search"
      >
        <label htmlFor="chrome-search" className="sr-only">Search agents, services, skills</label>
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-neutral-500 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            id="chrome-search"
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setHighlighted(-1);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Search agents, services, skills..."
            autoComplete="off"
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-neutral-800 text-sm font-sans text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-atelier focus:ring-2 focus:ring-atelier/20 transition-colors"
          />
        </div>
      </form>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0a0a0a] shadow-xl shadow-atelier/5 overflow-hidden z-30">
          {loading && flatSuggestions.length === 0 && (
            <div className="flex items-center justify-center py-4 text-2xs font-mono text-gray-400 dark:text-neutral-500 uppercase tracking-widest">
              <div className="w-3 h-3 border-2 border-atelier border-t-transparent rounded-full animate-spin mr-2" />
              Searching
            </div>
          )}

          {!loading && flatSuggestions.length === 0 && (
            <div className="px-3 py-4 text-xs font-mono text-gray-400 dark:text-neutral-500 uppercase tracking-widest text-center">
              No matches
            </div>
          )}

          {agents.length > 0 && (
            <SectionHeader label="Agents" count={agents.length} />
          )}
          {agents.map((agent) => {
            const i = indexFor();
            return (
              <SuggestionRow
                key={`agent-${agent.id}`}
                href={atelierHref(`/atelier/agents/${agent.slug}`)}
                isActive={i === highlighted}
                onHover={() => setHighlighted(i)}
                onClick={() => setOpen(false)}
                avatar={
                  agent.avatar_url ? (
                    <Image
                      src={agent.avatar_url}
                      alt={agent.name}
                      width={32}
                      height={32}
                      className="w-8 h-8 rounded-md object-cover shrink-0"
                      unoptimized
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : (
                    <Fallback letter={agent.name.charAt(0)} />
                  )
                }
                title={agent.name}
                badge={agent.is_atelier_official === 1 ? 'ATELIER' : null}
                subtitle={agent.description ?? undefined}
                trailing={
                  agent.min_price_usd != null ? (
                    <span className="text-xs font-mono font-semibold text-atelier shrink-0">
                      From ${agent.min_price_usd}
                    </span>
                  ) : null
                }
              />
            );
          })}

          {services.length > 0 && (
            <SectionHeader label="Services" count={services.length} />
          )}
          {services.map((svc) => {
            const i = indexFor();
            const price = parseFloat(svc.price_usd);
            return (
              <SuggestionRow
                key={`service-${svc.id}`}
                href={`${SERVICES_PATH}?search=${encodeURIComponent(svc.title)}`}
                isActive={i === highlighted}
                onHover={() => setHighlighted(i)}
                onClick={() => setOpen(false)}
                avatar={
                  svc.agent_avatar_url ? (
                    <Image
                      src={svc.agent_avatar_url}
                      alt={svc.agent_name}
                      width={32}
                      height={32}
                      className="w-8 h-8 rounded-md object-cover shrink-0"
                      unoptimized
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : (
                    <Fallback letter={svc.title.charAt(0)} />
                  )
                }
                title={svc.title}
                subtitle={`${svc.agent_name} · ${svc.category.replace(/_/g, ' ')}`}
                trailing={
                  Number.isFinite(price) ? (
                    <span className="text-xs font-mono font-semibold text-atelier shrink-0">
                      ${price.toFixed(price < 1 ? 2 : 0)}
                    </span>
                  ) : null
                }
              />
            );
          })}

          {skills.length > 0 && (
            <SectionHeader label="Skills" count={skills.length} />
          )}
          {skills.map((skill) => {
            const i = indexFor();
            const free = !skill.price || skill.price === 0;
            return (
              <SuggestionRow
                key={`skill-${skill.pack}-${skill.slug}`}
                href={`${SKILLS_PATH}/${skill.pack}/${skill.slug}`}
                isActive={i === highlighted}
                onHover={() => setHighlighted(i)}
                onClick={() => setOpen(false)}
                avatar={<Fallback letter={skill.name.charAt(0)} />}
                title={skill.name}
                subtitle={`${skill.category} · ${skill.tools.slice(0, 2).join(', ')}`}
                trailing={
                  <span className="text-xs font-mono font-semibold text-atelier shrink-0">
                    {free ? 'FREE' : `$${skill.price}`}
                  </span>
                }
              />
            );
          })}

          {!loading && flatSuggestions.length > 0 && (
            <button
              type="button"
              onClick={submit}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-mono font-semibold text-atelier bg-gray-50 dark:bg-neutral-900/50 hover:bg-atelier/5 transition-colors border-t border-gray-100 dark:border-neutral-900"
            >
              See all results for &ldquo;{value.trim()}&rdquo;
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 dark:bg-neutral-900/60 border-b border-gray-100 dark:border-neutral-900">
      <span className="text-2xs font-mono font-semibold uppercase tracking-widest text-gray-500 dark:text-neutral-400">
        {label}
      </span>
      <span className="text-2xs font-mono text-gray-400 dark:text-neutral-500">{count}</span>
    </div>
  );
}

function Fallback({ letter }: { letter: string }) {
  return (
    <div className="w-8 h-8 rounded-md bg-atelier/10 flex items-center justify-center shrink-0">
      <span className="text-sm font-bold font-display text-atelier/60">
        {letter.toUpperCase()}
      </span>
    </div>
  );
}

interface SuggestionRowProps {
  href: string;
  isActive: boolean;
  onHover: () => void;
  onClick: () => void;
  avatar: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: string | null;
  trailing?: React.ReactNode;
}

function SuggestionRow({
  href,
  isActive,
  onHover,
  onClick,
  avatar,
  title,
  subtitle,
  badge,
  trailing,
}: SuggestionRowProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      onMouseEnter={onHover}
      className={`flex items-center gap-3 px-3 py-2 transition-colors border-b border-gray-100 dark:border-neutral-900 last:border-b-0 ${
        isActive
          ? 'bg-atelier/5'
          : 'hover:bg-gray-50 dark:hover:bg-neutral-900/50'
      }`}
    >
      {avatar}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold font-display text-black dark:text-white truncate">
            {title}
          </span>
          {badge && (
            <span className="text-2xs font-mono px-1.5 py-0.5 rounded bg-atelier text-white shrink-0">
              {badge}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-xs text-gray-500 dark:text-neutral-400 truncate">
            {subtitle}
          </p>
        )}
      </div>
      {trailing}
    </Link>
  );
}

