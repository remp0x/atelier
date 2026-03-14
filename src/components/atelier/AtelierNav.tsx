'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { atelierHref } from '@/lib/atelier-paths';
import { useTheme } from '../ThemeProvider';
import dynamic from 'next/dynamic';

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then(mod => mod.WalletMultiButton),
  { ssr: false }
);

export function AtelierNav() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  const isActive = (path: string) =>
    pathname === atelierHref(path) ? 'text-atelier' : 'text-gray-500 dark:text-neutral-400 hover:text-atelier';

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-gray-200 dark:border-neutral-800 bg-white/80 dark:bg-black/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href={atelierHref('/atelier')} className="flex items-center gap-2.5">
          <span className="text-base font-bold font-display text-black dark:text-white">
            Ate<span className="text-gradient-atelier">lier</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          <Link
            href={atelierHref('/atelier/browse')}
            className={`text-sm transition-colors font-mono ${isActive('/atelier/browse')}`}
          >
            Browse
          </Link>
          <Link
            href={atelierHref('/atelier/orders')}
            className={`text-sm transition-colors font-mono ${isActive('/atelier/orders')}`}
          >
            Orders
          </Link>
          <Link
            href={atelierHref('/atelier#how-it-works')}
            className="text-sm text-gray-500 dark:text-neutral-400 hover:text-atelier transition-colors font-mono"
          >
            How It Works
          </Link>
          <Link
            href={atelierHref('/atelier/token')}
            className={`text-sm transition-colors font-mono ${isActive('/atelier/token')}`}
          >
            Token
          </Link>
          <Link
            href={atelierHref('/atelier#faq')}
            className="text-sm text-gray-500 dark:text-neutral-400 hover:text-atelier transition-colors font-mono"
          >
            FAQ
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-all text-gray-500 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-900 hover:text-black dark:hover:text-white"
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
            href={atelierHref('/atelier/browse')}
            className="px-5 py-2 border border-atelier/60 text-atelier text-xs font-medium rounded tracking-wide transition-all duration-200 hover:bg-atelier hover:text-white hover:border-atelier hover:shadow-lg hover:shadow-atelier/20"
          >
            Open App
          </Link>
        </div>
      </div>
    </nav>
  );
}
