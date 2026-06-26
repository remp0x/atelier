'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { atelierHref } from '@/lib/atelier-paths';
import { appUrl } from '@/lib/routing';
import { useTheme } from '../ThemeProvider';

const MOBILE_LINKS = [
  { href: appUrl('/agents'), label: 'Marketplace' },
  { href: '/skills-and-personas', label: 'Skills' },
  { href: '/x402', label: 'x402' },
  { href: appUrl('/bounties'), label: 'Bounties' },
  { href: appUrl('/agents/register'), label: 'Register Agent' },
];

export function AtelierNav() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const isActive = (path: string) =>
    pathname === atelierHref(path) ? 'text-atelier' : 'text-gray-500 dark:text-neutral-400 hover:text-atelier';

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-gray-200 dark:border-neutral-800 bg-white/80 dark:bg-black/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between relative">
        <Link href={atelierHref('/atelier')} className="flex items-center gap-2 flex-shrink-0 relative z-10">
          <Image src="/atelier_wb2.svg" alt="Atelier" width={24} height={24} className="w-6 h-6 rounded" />
          <span className="text-base font-bold font-display text-black dark:text-white">
            Atelier
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8 absolute inset-0 justify-center pointer-events-none">
          <Link
            href={appUrl('/agents')}
            className="text-sm transition-colors font-mono pointer-events-auto text-gray-500 dark:text-neutral-400 hover:text-atelier"
          >
            Marketplace
          </Link>
          <Link
            href="/skills-and-personas"
            className={`text-sm transition-colors font-mono pointer-events-auto ${isActive('/skills-and-personas')}`}
          >
            Skills
          </Link>
          <Link
            href="/x402"
            className={`text-sm transition-colors font-mono pointer-events-auto ${isActive('/x402')}`}
          >
            x402
          </Link>
          <Link
            href={appUrl('/bounties')}
            className={`text-sm transition-colors font-mono pointer-events-auto ${isActive('/atelier/bounties')}`}
          >
            Bounties
          </Link>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0 relative z-10">
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center w-9 h-9 rounded-lg transition-all cursor-pointer text-gray-500 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-900 hover:text-black dark:hover:text-white"
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
          <Link
            href={appUrl('/agents/register')}
            className="hidden md:inline-flex px-4 py-2 text-xs font-medium font-mono rounded-lg tracking-wide transition-all duration-200 text-gray-500 dark:text-neutral-400 hover:text-atelier hover:bg-atelier/5 dark:hover:bg-atelier/10"
          >
            Register Agent
          </Link>
          <Link
            href={appUrl('/agents')}
            className="hidden sm:inline-flex px-5 py-2 border border-atelier/60 text-atelier text-xs font-medium rounded tracking-wide transition-all duration-200 hover:bg-atelier hover:text-white hover:border-atelier hover:shadow-lg hover:shadow-atelier/20"
          >
            Open App
          </Link>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg transition-all cursor-pointer text-gray-500 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-900 hover:text-black dark:hover:text-white"
            aria-label="Menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t border-gray-200 dark:border-neutral-800 bg-white/95 dark:bg-black/95 backdrop-blur-xl">
          <div className="px-6 py-4 flex flex-col gap-1">
            {MOBILE_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`py-2.5 text-sm font-mono transition-colors ${
                  pathname === link.href ? 'text-atelier' : 'text-gray-600 dark:text-neutral-300 hover:text-atelier'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href={appUrl('/agents')}
              className="mt-2 inline-flex items-center justify-center px-5 py-2.5 border border-atelier/60 text-atelier text-xs font-medium rounded tracking-wide transition-all duration-200 hover:bg-atelier hover:text-white"
            >
              Open App
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
