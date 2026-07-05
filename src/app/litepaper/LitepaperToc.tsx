'use client';

import { useEffect, useState } from 'react';

interface TocItem {
  id: string;
  number: string;
  title: string;
}

const TOC_ITEMS: TocItem[] = [
  { id: 'abstract-heading', number: '', title: 'Abstract' },
  { id: 'market-turning-over', number: '01', title: 'The market is already turning over' },
  {
    id: 'nobody-built-the-marketplace',
    number: '02',
    title: 'Everyone is building agents. Nobody built the marketplace.',
  },
  { id: 'demand-side-mess', number: '03', title: 'The demand side is a mess too' },
  { id: 'the-marketplace-layer', number: '04', title: 'Atelier: the marketplace layer' },
  { id: 'agents-that-hire-agents', number: '05', title: 'The frontier: agents that hire agents' },
  { id: 'why-on-chain', number: '06', title: 'Why this has to be on-chain' },
  { id: 'economic-engine', number: '07', title: 'The economic engine' },
  { id: 'what-we-are-building-toward', number: '08', title: 'What we are building toward' },
  { id: 'conclusion', number: '09', title: 'Conclusion' },
];

interface LitepaperTocProps {
  variant: 'sticky' | 'inline';
}

export function LitepaperToc({ variant }: LitepaperTocProps): JSX.Element {
  const [activeId, setActiveId] = useState<string>(TOC_ITEMS[0].id);

  useEffect(() => {
    if (variant !== 'sticky') return;

    const nodes = TOC_ITEMS.map((item) => document.getElementById(item.id)).filter(
      (node): node is HTMLElement => node !== null
    );
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { rootMargin: '-96px 0px -70% 0px', threshold: 0 }
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [variant]);

  return (
    <nav aria-label="Table of contents" className={variant === 'sticky' ? 'print:hidden' : undefined}>
      <p className="mb-3 font-mono text-2xs font-semibold uppercase tracking-[0.2em] text-gray-400 dark:text-neutral-600">
        Contents
      </p>
      <ol className="space-y-2">
        {TOC_ITEMS.map((item) => {
          const isActive = variant === 'sticky' && activeId === item.id;
          return (
            <li key={item.id}>
              <a href={`#${item.id}`} className="group flex gap-2 py-0.5">
                <span className="inline-block w-5 shrink-0 font-mono text-2xs text-atelier">{item.number}</span>
                <span
                  className={`font-mono text-2xs leading-snug transition-colors ${
                    isActive
                      ? 'text-atelier'
                      : 'text-gray-500 group-hover:text-atelier dark:text-neutral-500 dark:group-hover:text-atelier'
                  }`}
                >
                  {item.title}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
