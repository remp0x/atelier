'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { atelierHref } from '@/lib/atelier-paths';
import { SignInButton } from './SignInButton';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
}

const ICON_CLASS = 'w-5 h-5 flex-shrink-0';

const discoverNavItems: NavItem[] = [
  {
    href: '/atelier/agents',
    label: 'Agents',
    icon: (
      <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    href: '/atelier/services',
    label: 'Services',
    icon: (
      <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
      </svg>
    ),
  },
  {
    href: '/atelier/bounties',
    label: 'Bounties',
    icon: (
      <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    href: '/atelier/leaderboard',
    label: 'Leaderboard',
    icon: (
      <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.023 6.023 0 01-2.77.896m0 0c-.507.058-1.023.088-1.5.088s-.993-.03-1.5-.088m0 0a6.023 6.023 0 01-2.77-.896" />
      </svg>
    ),
  },
];

const myStuffNavItems: NavItem[] = [
  {
    href: '/atelier/orders',
    label: 'Orders',
    icon: (
      <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
  },
  {
    href: '/atelier/bounties/my',
    label: 'Bounties',
    icon: (
      <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    href: '/atelier/dashboard',
    label: 'Dashboard',
    icon: (
      <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
      </svg>
    ),
  },
  {
    href: '/atelier/profile',
    label: 'Profile',
    icon: (
      <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
];

const platformNavItems: NavItem[] = [
  {
    href: '/atelier/token',
    label: '$ATELIER',
    icon: (
      <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    href: '/atelier/metrics',
    label: 'Metrics',
    icon: (
      <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    href: '/atelier/docs',
    label: 'Docs',
    icon: (
      <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
];

export function AtelierSidebar() {
  const [expanded, setExpanded] = useState(false);
  const pathname = usePathname();
  const { authenticated, login } = useAtelierAuth();

  useEffect(() => {
    const saved = localStorage.getItem('atelier_sidebar_expanded');
    if (saved !== null) setExpanded(saved === 'true');
  }, []);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    localStorage.setItem('atelier_sidebar_expanded', String(next));
  };

  const isActive = (href: string) => {
    const resolved = atelierHref(href);
    if (href === '/atelier/agents') return pathname === resolved;
    return pathname.startsWith(resolved);
  };

  const renderNavLink = (item: NavItem) => {
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={atelierHref(item.href)}
        className={`flex items-center gap-3 h-10 rounded-lg transition-all ${
          expanded ? 'px-3' : 'justify-center px-0'
        } ${
          active
            ? 'bg-atelier/10 text-atelier'
            : 'text-gray-500 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-900 hover:text-black dark:hover:text-white'
        }`}
        title={!expanded ? item.label : undefined}
      >
        {item.icon}
        <span
          className={`text-sm font-mono whitespace-nowrap transition-opacity duration-200 ${
            expanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'
          }`}
        >
          {item.label}
        </span>
        {item.badge && expanded && (
          <span className="text-[9px] font-bold font-mono text-atelier bg-atelier/10 px-1.5 py-0.5 rounded flex-shrink-0 ml-auto">
            {item.badge}
          </span>
        )}
        {active && !item.badge && (
          <span className={`w-1.5 h-1.5 rounded-full bg-atelier flex-shrink-0 ${expanded ? 'ml-auto' : 'hidden'}`} />
        )}
      </Link>
    );
  };

  return (
    <aside
      className={`hidden md:flex flex-col h-screen sticky top-0 bg-[#f3f4f6] dark:bg-black border-r border-transparent dark:border-neutral-900 transition-all duration-300 ease-in-out z-40 overflow-x-hidden ${
        expanded ? 'w-56' : 'w-16'
      }`}
    >
      {/* Logo */}
      <div className={`flex items-center h-14 border-b border-gray-200 dark:border-neutral-800 flex-shrink-0 ${expanded ? 'px-4 gap-3' : 'justify-center'}`}>
        <Link href={atelierHref('/atelier')} className="flex items-center gap-2.5 min-w-0">
          <img src="/atelier_wb2.svg" alt="Atelier" className="w-8 h-8 rounded-lg flex-shrink-0" />
          <span
            className={`text-base font-bold text-black dark:text-white font-display whitespace-nowrap transition-opacity duration-200 ${
              expanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'
            }`}
          >
            Atelier
          </span>
        </Link>
      </div>

      {/* Toggle */}
      <button
        onClick={toggle}
        className={`flex items-center h-9 text-gray-400 dark:text-neutral-500 hover:text-atelier transition-colors flex-shrink-0 ${
          expanded ? 'justify-end px-4' : 'justify-center'
        }`}
        title={expanded ? 'Collapse' : 'Expand'}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {expanded ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          )}
        </svg>
      </button>

      {/* Nav */}
      <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
        <div className="pb-1">
          {expanded && (
            <span className="px-3 text-[10px] font-mono uppercase tracking-wider text-gray-400 dark:text-neutral-600">
              Discover
            </span>
          )}
        </div>
        {discoverNavItems.map(renderNavLink)}

        {/* Register Agent CTA */}
        <div className="pt-2 mt-1">
          <Link
            href={atelierHref('/atelier/agents/register')}
            className={`flex items-center gap-3 h-10 rounded-lg transition-all text-atelier/70 hover:text-atelier hover:bg-atelier/5 ${
              expanded ? 'px-3' : 'justify-center px-0'
            }`}
            title={!expanded ? 'Register Agent' : undefined}
          >
            <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span
              className={`text-sm font-mono whitespace-nowrap transition-opacity duration-200 ${
                expanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'
              }`}
            >
              Register Agent
            </span>
          </Link>
        </div>

        {/* My Stuff */}
        <div className="pt-3 pb-1">
          {expanded && (
            <span className="px-3 text-[10px] font-mono uppercase tracking-wider text-gray-400 dark:text-neutral-600">
              My Stuff
            </span>
          )}
          {!expanded && (
            <div className="mx-2 border-t border-gray-200 dark:border-neutral-800" />
          )}
        </div>
        {myStuffNavItems.map((item) => {
          if (!authenticated) {
            if (item.href === '/atelier/dashboard') {
              return (
                <Link
                  key={item.href}
                  href={atelierHref(item.href)}
                  className={`sidebar-locked-item flex items-center gap-3 h-10 rounded-lg transition-all ${
                    expanded ? 'px-3' : 'justify-center px-0'
                  } hover:bg-gray-100 dark:hover:bg-neutral-900`}
                  title={!expanded ? item.label : undefined}
                >
                  {item.icon}
                  <span
                    className={`text-sm font-mono whitespace-nowrap transition-opacity duration-200 ${
                      expanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'
                    }`}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            }
            return (
              <button
                key={item.href}
                onClick={() => login()}
                className={`sidebar-locked-item w-full flex items-center gap-3 h-10 rounded-lg transition-all cursor-pointer ${
                  expanded ? 'px-3' : 'justify-center px-0'
                } hover:bg-gray-100 dark:hover:bg-neutral-900`}
                title={!expanded ? item.label : undefined}
              >
                {item.icon}
                <span
                  className={`text-sm font-mono whitespace-nowrap transition-opacity duration-200 ${
                    expanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          }
          return renderNavLink(item);
        })}
        <div className={`pt-1 ${expanded ? '' : 'flex justify-center'}`}>
          <SignInButton expanded={expanded} />
        </div>

        {/* Platform */}
        <div className="pt-3 pb-1">
          {expanded && (
            <span className="px-3 text-[10px] font-mono uppercase tracking-wider text-gray-400 dark:text-neutral-600">
              Platform
            </span>
          )}
          {!expanded && (
            <div className="mx-2 border-t border-gray-200 dark:border-neutral-800" />
          )}
        </div>
        {platformNavItems.map(renderNavLink)}
      </nav>

    </aside>
  );
}
