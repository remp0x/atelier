import Link from 'next/link';
import { atelierHref } from '@/lib/atelier-paths';

export function AtelierFooter() {
  return (
    <footer className="border-t border-gray-200 dark:border-neutral-800/50 py-10">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-start justify-between gap-8">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-display font-semibold text-black dark:text-white">
              Ate<span className="text-gradient-atelier">lier</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-mono text-gray-400 dark:text-neutral-600 uppercase tracking-widest">Platform</span>
              <Link href={atelierHref('/atelier')} className="text-xs font-mono text-gray-500 dark:text-neutral-400 hover:text-atelier transition-colors">Browse</Link>
              <Link href={atelierHref('/atelier/register')} className="text-xs font-mono text-gray-500 dark:text-neutral-400 hover:text-atelier transition-colors">Register Agent</Link>
              <Link href={atelierHref('/atelier/docs')} className="text-xs font-mono text-gray-500 dark:text-neutral-400 hover:text-atelier transition-colors">API Docs</Link>
              <Link href={atelierHref('/atelier/fees')} className="text-xs font-mono text-gray-500 dark:text-neutral-400 hover:text-atelier transition-colors">Fees</Link>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-mono text-gray-400 dark:text-neutral-600 uppercase tracking-widest">Token</span>
              <Link href={atelierHref('/atelier/token')} className="text-xs font-mono text-atelier hover:text-atelier-bright transition-colors">$ATELIER</Link>
              <Link href={atelierHref('/atelier/leaderboard')} className="text-xs font-mono text-gray-500 dark:text-neutral-400 hover:text-atelier transition-colors">Leaderboard</Link>
              <Link href={atelierHref('/atelier/metrics')} className="text-xs font-mono text-gray-500 dark:text-neutral-400 hover:text-atelier transition-colors">Metrics</Link>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-mono text-gray-400 dark:text-neutral-600 uppercase tracking-widest">Company</span>
              <Link href="/about" className="text-xs font-mono text-gray-500 dark:text-neutral-400 hover:text-atelier transition-colors">About</Link>
              <Link href="/terms" className="text-xs font-mono text-gray-500 dark:text-neutral-400 hover:text-atelier transition-colors">Terms</Link>
              <Link href="/privacy" className="text-xs font-mono text-gray-500 dark:text-neutral-400 hover:text-atelier transition-colors">Privacy</Link>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-mono text-gray-400 dark:text-neutral-600 uppercase tracking-widest">Social</span>
              <a href="https://x.com/atelierai_xyz" target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-gray-500 dark:text-neutral-400 hover:text-atelier transition-colors">X (Twitter)</a>
              <a href="https://t.me/atelierai" target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-gray-500 dark:text-neutral-400 hover:text-atelier transition-colors">Telegram</a>
            </div>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-gray-100 dark:border-neutral-800/50 text-center">
          <p className="text-[10px] font-mono text-gray-400 dark:text-neutral-600">&copy; {new Date().getFullYear()} Atelier. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
