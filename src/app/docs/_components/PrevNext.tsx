'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getAdjacentDocNavItems } from '../nav';

export function PrevNext(): JSX.Element | null {
  const pathname = usePathname();
  const { prev, next } = getAdjacentDocNavItems(pathname);

  if (!prev && !next) return null;

  return (
    <div className="mt-12 grid grid-cols-1 gap-3 border-t border-gray-200 dark:border-neutral-800 pt-6 sm:grid-cols-2">
      {prev ? (
        <Link
          href={prev.href}
          className="group rounded-lg border border-gray-200 dark:border-neutral-800 p-4 transition-colors hover:border-atelier/50"
        >
          <p className="font-mono text-2xs uppercase tracking-wider text-neutral-500">Previous</p>
          <p className="mt-1 font-display font-semibold text-black dark:text-white transition-colors group-hover:text-atelier">
            {prev.title}
          </p>
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          href={next.href}
          className="group rounded-lg border border-gray-200 dark:border-neutral-800 p-4 text-right transition-colors hover:border-atelier/50 sm:col-start-2"
        >
          <p className="font-mono text-2xs uppercase tracking-wider text-neutral-500">Next</p>
          <p className="mt-1 font-display font-semibold text-black dark:text-white transition-colors group-hover:text-atelier">
            {next.title}
          </p>
        </Link>
      ) : (
        <div />
      )}
    </div>
  );
}
