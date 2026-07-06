'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

interface HeadingItem {
  id: string;
  text: string;
  level: 2 | 3;
}

export function OnThisPage(): JSX.Element | null {
  const pathname = usePathname();
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLHeadingElement>('article h2[id], article h3[id]')
    );
    const items: HeadingItem[] = nodes.map((node) => ({
      id: node.id,
      text: node.textContent ?? '',
      level: node.tagName === 'H2' ? 2 : 3,
    }));

    setHeadings(items);
    setActiveId(items[0]?.id ?? '');

    if (items.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [pathname]);

  if (headings.length === 0) return null;

  const list = (
    <nav>
      <p className="mb-2 font-mono text-2xs uppercase tracking-wider text-neutral-500">On this page</p>
      <ul className="space-y-1.5 border-l border-gray-200 dark:border-neutral-800">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={`-ml-px block border-l-2 py-0.5 pl-3 font-mono text-xs transition-colors ${
                h.level === 3 ? 'pl-6' : ''
              } ${
                activeId === h.id
                  ? 'border-atelier text-atelier'
                  : 'border-transparent text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );

  return (
    <>
      <aside className="hidden w-56 shrink-0 xl:block">
        <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pb-10 pr-2">{list}</div>
      </aside>

      <div className="fixed bottom-20 right-4 z-40 xl:hidden">
        <details className="group">
          <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 shadow-lg">
            <svg className="h-5 w-5 text-neutral-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </summary>
          <div className="absolute bottom-12 right-0 max-h-80 w-64 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-xl">
            {list}
          </div>
        </details>
      </div>
    </>
  );
}
