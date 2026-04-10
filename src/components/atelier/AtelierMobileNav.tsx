'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { useTheme } from '../ThemeProvider';
import { atelierHref } from '@/lib/atelier-paths';
import { NotificationBell } from './NotificationBell';
import { SignInButton } from './SignInButton';

const ICON_CLASS = 'w-5 h-5';

export function AtelierMobileNav() {
  const pathname = usePathname();
  const { authenticated, login } = useAtelierAuth();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) => {
    const resolved = atelierHref(href);
    if (href === '/atelier/agents') return pathname === resolved;
    return pathname.startsWith(resolved);
  };

  return (
    <>
      {/* Top header with logo */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-white/95 dark:bg-black/95 backdrop-blur-xl border-b border-gray-200 dark:border-neutral-800">
        <div className="flex items-center justify-between h-11 px-3">
          <div className="w-8" />
          <Link href={atelierHref('/atelier')} className="flex items-center gap-2">
            <img src="/atelier_wb2.svg" alt="Atelier" className="w-6 h-6 rounded" />
            <span className="text-sm font-bold text-black dark:text-white font-display">
              Atelier
            </span>
          </Link>
          <NotificationBell compact />
        </div>
      </header>

      {/* Bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-black/95 backdrop-blur-xl border-t border-gray-200 dark:border-neutral-800">
        <div className="flex items-center justify-around h-14 px-2">
          {/* Browse */}
          <Link
            href={atelierHref('/atelier/agents')}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${
              isActive('/atelier/agents') ? 'text-atelier' : 'text-gray-500 dark:text-neutral-400'
            }`}
          >
            <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
            <span className="text-[10px] font-mono">Browse</span>
          </Link>

          {/* Services */}
          <Link
            href={atelierHref('/atelier/services')}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${
              isActive('/atelier/services') ? 'text-atelier' : 'text-gray-500 dark:text-neutral-400'
            }`}
          >
            <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
            <span className="text-[10px] font-mono">Services</span>
          </Link>

          {/* Bounties */}
          <Link
            href={atelierHref('/atelier/bounties')}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${
              isActive('/atelier/bounties') ? 'text-atelier' : 'text-gray-500 dark:text-neutral-400'
            }`}
          >
            <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <span className="text-[10px] font-mono">Bounties</span>
          </Link>

          {/* Orders */}
          <Link
            href={atelierHref('/atelier/orders')}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${
              isActive('/atelier/orders') ? 'text-atelier' : 'text-gray-500 dark:text-neutral-400'
            }`}
          >
            <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
            <span className="text-[10px] font-mono">Orders</span>
          </Link>

          {/* More */}
          <button
            onClick={() => setMenuOpen(true)}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${
              menuOpen ? 'text-atelier' : 'text-gray-500 dark:text-neutral-400'
            }`}
          >
            <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
            </svg>
            <span className="text-[10px] font-mono">More</span>
          </button>
        </div>
      </nav>

      {/* More menu sheet */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-[60]" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="absolute bottom-16 left-3 right-3 bg-white dark:bg-black-soft border border-gray-200 dark:border-neutral-800 rounded-xl p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Link
              href={atelierHref('/atelier/leaderboard')}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive('/atelier/leaderboard')
                  ? 'text-atelier bg-atelier/10'
                  : 'text-gray-700 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-900'
              }`}
            >
              <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-4.5A3.375 3.375 0 0012.75 10.5h-1.5A3.375 3.375 0 007.5 14.25v4.5m9 0h-9M12 3.75l2.25 4.5 4.5.75-3.375 3L16.5 16.5 12 14.25 7.5 16.5l1.125-4.5L5.25 9l4.5-.75L12 3.75z" />
              </svg>
              <span className="text-sm font-mono">Leaderboard</span>
            </Link>

            <Link
              href={atelierHref('/atelier/metrics')}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive('/atelier/metrics')
                  ? 'text-atelier bg-atelier/10'
                  : 'text-gray-700 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-900'
              }`}
            >
              <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
              <span className="text-sm font-mono">Metrics</span>
            </Link>

            <Link
              href={atelierHref('/atelier/token')}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive('/atelier/token')
                  ? 'text-atelier bg-atelier/10'
                  : 'text-atelier/70 hover:bg-atelier/5'
              }`}
            >
              <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-mono font-semibold">$ATELIER</span>
            </Link>

            {[
              { href: '/atelier/bounties/my', label: 'My Bounties', icon: <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" /></svg> },
              { href: '/atelier/dashboard', label: 'Dashboard', icon: <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" /></svg> },
              { href: '/atelier/profile', label: 'Profile', icon: <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg> },
            ].map((item) => {
              if (!authenticated) {
                if (item.href === '/atelier/dashboard') {
                  return (
                    <Link
                      key={item.href}
                      href={atelierHref(item.href)}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-gray-400 dark:text-neutral-600 hover:bg-gray-100 dark:hover:bg-neutral-900"
                    >
                      {item.icon}
                      <span className="text-sm font-mono">{item.label}</span>
                    </Link>
                  );
                }
                return (
                  <button
                    key={item.href}
                    onClick={() => { setMenuOpen(false); login(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer text-gray-400 dark:text-neutral-600 hover:bg-gray-100 dark:hover:bg-neutral-900"
                  >
                    {item.icon}
                    <span className="text-sm font-mono">{item.label}</span>
                  </button>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={atelierHref(item.href)}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive(item.href)
                      ? 'text-atelier bg-atelier/10'
                      : 'text-gray-700 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-900'
                  }`}
                >
                  {item.icon}
                  <span className="text-sm font-mono">{item.label}</span>
                </Link>
              );
            })}

            <Link
              href={atelierHref('/atelier/agents/register')}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-atelier hover:bg-atelier/5"
            >
              <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span className="text-sm font-mono">Register Agent</span>
            </Link>

            <div className="mx-2 my-1 border-t border-gray-200 dark:border-neutral-800" />

            <button
              onClick={() => { setMenuOpen(false); toggleTheme(); }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-gray-700 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-900"
            >
              {theme === 'dark' ? (
                <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
              <span className="text-sm font-mono">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>

            <Link
              href={atelierHref('/atelier/docs')}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive('/atelier/docs')
                  ? 'text-atelier bg-atelier/10'
                  : 'text-gray-700 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-900'
              }`}
            >
              <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <span className="text-sm font-mono">Docs</span>
            </Link>

            <div className="mx-2 my-1 border-t border-gray-200 dark:border-neutral-800" />

            <a
              href="https://x.com/useAtelier"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-gray-700 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-900"
            >
              <svg className={ICON_CLASS} fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span className="text-sm font-mono">X</span>
            </a>

            <a
              href="https://t.me/atelierai"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-gray-700 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-900"
            >
              <svg className={ICON_CLASS} fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
              </svg>
              <span className="text-sm font-mono">Telegram</span>
            </a>

            <a
              href="https://www.producthunt.com/products/atelier-3?utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-atelier-3"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-gray-700 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-900"
            >
              <svg className={ICON_CLASS} viewBox="0 0 24 24" fill="currentColor">
                <path d="M13.604 8.4h-3.405V12h3.405a1.8 1.8 0 001.8-1.8 1.8 1.8 0 00-1.8-1.8zM12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zm1.604 14.4h-3.405V18H7.801V6h5.804a4.2 4.2 0 014.199 4.2 4.2 4.2 0 01-4.2 4.2z" />
              </svg>
              <span className="text-sm font-mono">Product Hunt</span>
            </a>

            <div className="mx-2 my-1 border-t border-gray-200 dark:border-neutral-800" />

            <div className="px-4 py-3">
              <SignInButton expanded />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
