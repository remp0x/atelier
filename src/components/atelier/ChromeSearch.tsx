'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { atelierHref } from '@/lib/atelier-paths';
import type { AtelierAgentListItem } from '@/lib/atelier-db';

const BROWSE_PATH = atelierHref('/atelier/agents');
const MIN_QUERY_LEN = 2;
const MAX_SUGGESTIONS = 5;

export function ChromeSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlSearch = searchParams?.get('search') ?? '';
  const [value, setValue] = useState(urlSearch);
  const [suggestions, setSuggestions] = useState<AtelierAgentListItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setValue(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    if (value.trim().length < MIN_QUERY_LEN) {
      setSuggestions([]);
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const handle = setTimeout(() => {
      setLoading(true);
      fetch(
        `/api/agents?search=${encodeURIComponent(value.trim())}&limit=${MAX_SUGGESTIONS}`,
        { signal: ctrl.signal }
      )
        .then((r) => r.json())
        .then((res) => {
          if (res.success && Array.isArray(res.data)) {
            setSuggestions(res.data.slice(0, MAX_SUGGESTIONS));
          }
        })
        .catch((err) => {
          if (err.name !== 'AbortError') setSuggestions([]);
        })
        .finally(() => setLoading(false));
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

  const onBrowse = pathname === BROWSE_PATH;

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (onBrowse) {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (trimmed) params.set('search', trimmed);
      else params.delete('search');
      const qs = params.toString();
      router.replace(`${BROWSE_PATH}${qs ? `?${qs}` : ''}`);
    } else {
      const qs = trimmed ? `?search=${encodeURIComponent(trimmed)}` : '';
      router.push(`${BROWSE_PATH}${qs}`);
    }
    setOpen(false);
  }, [value, onBrowse, searchParams, router]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const showDropdown =
      open && value.trim().length >= MIN_QUERY_LEN && (loading || suggestions.length > 0);

    if (e.key === 'Escape') {
      if (showDropdown) {
        setOpen(false);
        return;
      }
      setValue('');
      if (onBrowse) {
        const params = new URLSearchParams(searchParams?.toString() ?? '');
        params.delete('search');
        const qs = params.toString();
        router.replace(`${BROWSE_PATH}${qs ? `?${qs}` : ''}`);
      }
      return;
    }

    if (!showDropdown || suggestions.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlighted >= 0 && suggestions[highlighted]) {
        router.push(atelierHref(`/atelier/agents/${suggestions[highlighted].slug}`));
        setOpen(false);
      } else {
        submit();
      }
    }
  };

  const showDropdown =
    open && value.trim().length >= MIN_QUERY_LEN && (loading || suggestions.length > 0);

  return (
    <div ref={containerRef} className="relative flex-1 max-w-2xl z-20">
      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        role="search"
      >
        <label htmlFor="chrome-search" className="sr-only">Search agents</label>
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
            placeholder="Search agents, services, capabilities..."
            autoComplete="off"
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-neutral-800 text-sm font-sans text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-atelier focus:ring-2 focus:ring-atelier/20 transition-colors"
          />
        </div>
      </form>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0a0a0a] shadow-xl shadow-atelier/5 overflow-hidden z-30">
          {loading && suggestions.length === 0 && (
            <div className="flex items-center justify-center py-4 text-2xs font-mono text-gray-400 dark:text-neutral-500 uppercase tracking-widest">
              <div className="w-3 h-3 border-2 border-atelier border-t-transparent rounded-full animate-spin mr-2" />
              Searching
            </div>
          )}

          {suggestions.map((agent, i) => (
            <Link
              key={agent.id}
              href={atelierHref(`/atelier/agents/${agent.slug}`)}
              onClick={() => setOpen(false)}
              onMouseEnter={() => setHighlighted(i)}
              className={`flex items-center gap-3 px-3 py-2 transition-colors border-b border-gray-100 dark:border-neutral-900 last:border-b-0 ${
                i === highlighted
                  ? 'bg-atelier/5'
                  : 'hover:bg-gray-50 dark:hover:bg-neutral-900/50'
              }`}
            >
              {agent.avatar_url ? (
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
                <div className="w-8 h-8 rounded-md bg-atelier/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold font-display text-atelier/60">
                    {agent.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold font-display text-black dark:text-white truncate">
                    {agent.name}
                  </span>
                  {agent.is_atelier_official === 1 && (
                    <span className="text-2xs font-mono px-1.5 py-0.5 rounded bg-atelier text-white shrink-0">
                      ATELIER
                    </span>
                  )}
                </div>
                {agent.description && (
                  <p className="text-xs text-gray-500 dark:text-neutral-400 truncate">
                    {agent.description}
                  </p>
                )}
              </div>
              {agent.min_price_usd != null && (
                <span className="text-xs font-mono font-semibold text-atelier shrink-0">
                  From ${agent.min_price_usd}
                </span>
              )}
            </Link>
          ))}

          {!loading && suggestions.length > 0 && (
            <button
              type="button"
              onClick={submit}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-mono font-semibold text-atelier bg-gray-50 dark:bg-neutral-900/50 hover:bg-atelier/5 transition-colors"
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
