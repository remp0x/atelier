'use client';

import Fuse from 'fuse.js';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

interface DocSearchEntry {
  title: string;
  href: string;
  group: string;
  description: string;
  headings: string[];
  excerpt: string;
  keywords: string[];
}

interface DocsSearchContextValue {
  openSearch: () => void;
}

const DocsSearchContext = createContext<DocsSearchContextValue | null>(null);

export function useDocsSearch(): DocsSearchContextValue {
  const ctx = useContext(DocsSearchContext);
  if (!ctx) throw new Error('useDocsSearch must be used within DocsSearchProvider');
  return ctx;
}

interface DocsSearchProviderProps {
  children: ReactNode;
}

export function DocsSearchProvider({ children }: DocsSearchProviderProps): JSX.Element {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent): void {
      const target = e.target as HTMLElement | null;
      const isTyping =
        !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }

      if (e.key === '/' && !isTyping) {
        e.preventDefault();
        setOpen(true);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const openSearch = useCallback(() => setOpen(true), []);

  return (
    <DocsSearchContext.Provider value={{ openSearch }}>
      {children}
      {open && <DocsSearchModal onClose={() => setOpen(false)} />}
    </DocsSearchContext.Provider>
  );
}

interface DocsSearchModalProps {
  onClose: () => void;
}

function DocsSearchModal({ onClose }: DocsSearchModalProps): JSX.Element {
  const router = useRouter();
  const [entries, setEntries] = useState<DocSearchEntry[]>([]);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    let cancelled = false;
    fetch('/docs-search-index.json')
      .then((res) => res.json())
      .then((data: DocSearchEntry[]) => {
        if (!cancelled) setEntries(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fuse = useMemo(
    () =>
      new Fuse(entries, {
        keys: [
          { name: 'title', weight: 0.4 },
          { name: 'headings', weight: 0.25 },
          { name: 'keywords', weight: 0.2 },
          { name: 'description', weight: 0.1 },
          { name: 'excerpt', weight: 0.05 },
        ],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [entries]
  );

  const results = useMemo<DocSearchEntry[]>(() => {
    const trimmed = query.trim();
    if (!trimmed) return entries.slice(0, 8);
    return fuse.search(trimmed, { limit: 20 }).map((r) => r.item);
  }, [query, entries, fuse]);

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  const goTo = useCallback(
    (href: string) => {
      router.push(href);
      onClose();
    },
    [router, onClose]
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((prev) => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((prev) => (prev <= 0 ? results.length - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = results[highlighted];
      if (target) goTo(target.href);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[10vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-black-soft shadow-2xl">
        <div className="flex items-center gap-2 border-b border-gray-200 dark:border-neutral-800 px-4 py-3">
          <svg className="h-4 w-4 shrink-0 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search documentation..."
            autoComplete="off"
            className="w-full bg-transparent font-sans text-sm text-black dark:text-white placeholder:text-neutral-500 focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-gray-300 dark:border-neutral-700 px-1.5 py-0.5 font-mono text-2xs text-neutral-500 sm:block">
            Esc
          </kbd>
        </div>

        <div className="max-h-96 overflow-y-auto py-2">
          {results.length === 0 && (
            <p className="px-4 py-6 text-center font-mono text-xs uppercase tracking-widest text-neutral-500">
              No matches
            </p>
          )}
          {results.map((entry, i) => (
            <button
              key={entry.href}
              type="button"
              onClick={() => goTo(entry.href)}
              onMouseEnter={() => setHighlighted(i)}
              className={`block w-full px-4 py-2.5 text-left transition-colors ${
                highlighted === i ? 'bg-atelier/10' : 'hover:bg-gray-50 dark:hover:bg-neutral-900/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-display text-sm font-semibold text-black dark:text-white">
                  {entry.title}
                </span>
                <span className="shrink-0 font-mono text-2xs text-neutral-500">{entry.group}</span>
              </div>
              {entry.description && (
                <p className="mt-0.5 truncate text-xs text-neutral-500">{entry.description}</p>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
