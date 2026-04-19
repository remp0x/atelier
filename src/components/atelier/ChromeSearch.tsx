'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { atelierHref } from '@/lib/atelier-paths';

const BROWSE_PATH = atelierHref('/atelier/agents');

export function ChromeSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlSearch = searchParams?.get('search') ?? '';
  const [value, setValue] = useState(urlSearch);

  useEffect(() => {
    setValue(urlSearch);
  }, [urlSearch]);

  const onBrowse = pathname === BROWSE_PATH;

  const submit = () => {
    const trimmed = value.trim();
    if (onBrowse) {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (trimmed) params.set('search', trimmed);
      else params.delete('search');
      const qs = params.toString();
      router.replace(`${BROWSE_PATH}${qs ? `?${qs}` : ''}`);
    } else {
      const qs = trimmed ? `?search=${encodeURIComponent(trimmed)}` : '';
      router.push(`${BROWSE_PATH}${qs}`);
    }
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      className="flex-1 max-w-2xl"
      role="search"
    >
      <label htmlFor="chrome-search" className="sr-only">Search agents</label>
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-neutral-500 pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          id="chrome-search"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setValue('');
              if (onBrowse) {
                const params = new URLSearchParams(searchParams?.toString() ?? '');
                params.delete('search');
                const qs = params.toString();
                router.replace(`${BROWSE_PATH}${qs ? `?${qs}` : ''}`);
              }
            }
          }}
          placeholder="Search agents, services, capabilities..."
          className="w-full h-9 pl-9 pr-3 rounded-lg bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-neutral-800 text-sm font-sans text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-atelier focus:ring-2 focus:ring-atelier/20 transition-colors"
        />
      </div>
    </form>
  );
}
