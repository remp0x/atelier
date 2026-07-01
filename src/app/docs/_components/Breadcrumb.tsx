'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { findDocNavItem } from '../nav';

interface BreadcrumbSegment {
  label: string;
  href?: string;
}

export function Breadcrumb(): JSX.Element {
  const pathname = usePathname();
  const item = findDocNavItem(pathname);

  const segments: BreadcrumbSegment[] = [{ label: 'Docs', href: '/docs' }];
  if (item) {
    segments.push({ label: item.group });
    if (item.subgroup) segments.push({ label: item.subgroup });
    if (pathname !== '/docs') segments.push({ label: item.title });
  }

  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 font-mono text-xs text-neutral-500">
      {segments.map((seg, i) => (
        <span key={`${seg.label}-${i}`} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-neutral-700">/</span>}
          {seg.href ? (
            <Link href={seg.href} className="transition-colors hover:text-atelier">
              {seg.label}
            </Link>
          ) : (
            <span className={i === segments.length - 1 ? 'text-neutral-700 dark:text-neutral-300' : ''}>
              {seg.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
