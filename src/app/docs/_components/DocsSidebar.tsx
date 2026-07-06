'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { DOCS_NAV } from '../nav';
import { useDocsSearch } from './DocsSearch';

function SearchIcon(): JSX.Element {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function SearchTrigger(): JSX.Element {
  const { openSearch } = useDocsSearch();
  return (
    <button
      type="button"
      onClick={openSearch}
      className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-black-soft px-3 py-2 text-left font-mono text-xs text-neutral-500 transition-colors hover:border-atelier/40"
    >
      <span className="flex items-center gap-2">
        <SearchIcon />
        Search docs
      </span>
      <span className="hidden items-center gap-0.5 rounded border border-gray-300 dark:border-neutral-700 px-1.5 py-0.5 text-2xs sm:flex">
        <span>Cmd</span>
        <span>K</span>
      </span>
    </button>
  );
}

interface NavListProps {
  pathname: string;
  onNavigate?: () => void;
}

function NavList({ pathname, onNavigate }: NavListProps): JSX.Element {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (title: string): void => {
    setCollapsedGroups((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  return (
    <nav className="space-y-5">
      {DOCS_NAV.map((group) => {
        const isCollapsed = collapsedGroups[group.title] ?? false;
        return (
          <div key={group.title}>
            <button
              type="button"
              onClick={() => toggleGroup(group.title)}
              className="mb-1.5 flex w-full items-center justify-between font-mono text-[10px] uppercase tracking-wider text-neutral-500 transition-colors hover:text-neutral-300"
            >
              {group.title}
              <svg
                className={`h-3 w-3 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {!isCollapsed && (
              <div className="space-y-3">
                {group.subgroups.map((sub) => (
                  <div key={sub.title ?? '_default'}>
                    {sub.title && (
                      <p className="mb-1 px-2 font-mono text-[10px] text-neutral-600">{sub.title}</p>
                    )}
                    <div className="space-y-0.5">
                      {sub.items.map((item) => {
                        const active = pathname === item.href;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={onNavigate}
                            className={`block rounded-md px-2 py-1.5 font-mono text-sm transition-colors ${
                              active
                                ? 'bg-atelier/10 text-atelier'
                                : 'text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-900 hover:text-black dark:hover:text-white'
                            }`}
                          >
                            {item.title}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function LitepaperLink({ onNavigate }: { onNavigate?: () => void }): JSX.Element {
  return (
    <div className="border-t border-gray-200 dark:border-neutral-800 pt-4">
      <Link
        href="/litepaper"
        onClick={onNavigate}
        className="flex items-center gap-2 font-mono text-xs text-neutral-500 transition-colors hover:text-atelier"
      >
        Litepaper
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </Link>
    </div>
  );
}

export function DocsSidebar(): JSX.Element {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-24 max-h-[calc(100vh-8rem)] space-y-5 overflow-y-auto pb-10 pr-4">
          <SearchTrigger />
          <NavList pathname={pathname} />
          <LitepaperLink />
        </div>
      </aside>

      {/* Mobile menu trigger */}
      <div className="mb-4 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-neutral-800 px-3 py-2 font-mono text-sm text-neutral-400"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
          Docs menu
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto border-r border-gray-200 dark:border-neutral-800 bg-white dark:bg-black-soft p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="font-display text-sm font-bold text-black dark:text-white">Documentation</span>
              <button type="button" onClick={() => setMobileOpen(false)} className="text-neutral-500 hover:text-atelier">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-5">
              <SearchTrigger />
              <NavList pathname={pathname} onNavigate={() => setMobileOpen(false)} />
              <LitepaperLink onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
