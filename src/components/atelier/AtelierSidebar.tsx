'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { atelierHref } from '@/lib/atelier-paths';
import { isAtelierAdminEmail } from '@/lib/admin-client';
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
    href: '/atelier/skills',
    label: 'Skills',
    icon: (
      <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
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
    href: '/atelier/launchpad',
    label: 'Launchpad',
    icon: (
      <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
      </svg>
    ),
  },
  {
    href: '/earn',
    label: 'Earn',
    icon: (
      <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
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
    label: 'Agents',
    icon: (
      <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
      </svg>
    ),
  },
  {
    href: '/wallet',
    label: 'Wallet',
    icon: (
      <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
      </svg>
    ),
  },
  {
    href: '/profile',
    label: 'Profile',
    icon: (
      <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
];

const metricsNavItem: NavItem = {
  href: '/atelier/metrics',
  label: 'Metrics',
  icon: (
    <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
};

export function AtelierSidebar() {
  const [expanded, setExpanded] = useState(false);
  const pathname = usePathname();
  const { authenticated, atelierUser, user } = useAtelierAuth();
  const isAdmin = isAtelierAdminEmail(user?.google?.email ?? user?.email?.address ?? null);

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

  const renderNavLink = (item: NavItem, opts?: { muted?: boolean }) => {
    const active = isActive(item.href);
    const inactiveClass = opts?.muted
      ? 'text-gray-400 dark:text-neutral-500 opacity-40 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-neutral-900 hover:text-gray-700 dark:hover:text-neutral-300'
      : 'text-gray-500 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-900 hover:text-black dark:hover:text-white';
    return (
      <Link
        key={item.href}
        href={atelierHref(item.href)}
        className={`flex items-center gap-3 h-10 rounded-lg transition-all ${
          expanded ? 'px-3' : 'justify-center px-0'
        } ${active ? 'bg-atelier/10 text-atelier' : inactiveClass}`}
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
      <nav className="flex-1 flex flex-col py-2 px-2 overflow-y-auto overflow-x-hidden">
        <div className="space-y-0.5">
          <div className="pb-1">
            {expanded && (
              <span className="px-3 text-[10px] font-mono uppercase tracking-wider text-gray-400 dark:text-neutral-600">
                Discover
              </span>
            )}
          </div>
          {discoverNavItems.map((item) => renderNavLink(item))}

          {isAdmin && (
            <>
              {expanded ? (
                <div className="pt-2 pb-1">
                  <span className="px-3 text-[10px] font-mono uppercase tracking-wider text-gray-400 dark:text-neutral-600">
                    Admin
                  </span>
                </div>
              ) : (
                <div className="pt-3 pb-1">
                  <div className="mx-2 border-t border-gray-200 dark:border-neutral-800" />
                </div>
              )}
              {renderNavLink(metricsNavItem)}
            </>
          )}
        </div>

        {/* My Stuff — only visible when signed in, pushed to the bottom of the nav */}
        {authenticated && (
          <div className="mt-auto space-y-0.5">
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
              if (item.href === '/profile' && atelierUser?.username) {
                return renderNavLink({ ...item, href: `/profile/${atelierUser.username}` });
              }
              return renderNavLink(item);
            })}
          </div>
        )}
      </nav>

      {/* Bottom section: Connect/Account */}
      <div className="flex-shrink-0">
        <div className="border-t border-gray-200 dark:border-neutral-900" />

        <div className={`p-2 ${expanded ? '' : 'flex justify-center'}`}>
          <SignInButton expanded={expanded} secondary={!authenticated} />
        </div>
      </div>

    </aside>
  );
}
