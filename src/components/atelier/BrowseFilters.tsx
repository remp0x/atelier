'use client';

import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, CATEGORY_ICONS, CATEGORY_LABELS } from './constants';
import type { ServiceCategory } from '@/lib/atelier-db';

export function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

export function TriggerButton({
  onClick,
  active,
  children,
  expanded,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
  expanded: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className={`flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-mono whitespace-nowrap border transition-all duration-150 cursor-pointer ${
        active
          ? 'bg-atelier/10 border-atelier/40 text-atelier'
          : 'bg-gray-50 dark:bg-neutral-900/50 border-gray-200 dark:border-neutral-800 text-gray-600 dark:text-neutral-400 hover:border-atelier/30 hover:bg-white dark:hover:bg-neutral-900 hover:text-black dark:hover:text-white'
      }`}
    >
      {children}
      <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );
}

export function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-gray-400 dark:text-neutral-500 mb-1.5">{label}</div>
      <div className="space-y-0.5 max-h-40 overflow-y-auto scrollbar-hide">{children}</div>
    </div>
  );
}

export function FilterOption({ selected, onClick, label }: { selected: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs font-mono transition-colors cursor-pointer ${
        selected
          ? 'bg-atelier/10 text-atelier'
          : 'text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-900 hover:text-black dark:hover:text-white'
      }`}
    >
      <span className="truncate">{label}</span>
      {selected && (
        <svg className="w-3.5 h-3.5 flex-shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      )}
    </button>
  );
}

export function CategoryPillRow({
  activeCategory,
  onSelect,
}: {
  activeCategory: string;
  onSelect: (cat: ServiceCategory | 'all') => void;
}) {
  return (
    <div
      className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto scrollbar-hide pr-4"
      style={{
        WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent 100%)',
        maskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent 100%)',
      }}
    >
      {CATEGORIES.map((cat) => {
        const active = activeCategory === cat;
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onSelect(cat)}
            className={`flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-mono whitespace-nowrap border transition-colors duration-150 ${
              active
                ? 'bg-atelier/10 border-atelier/40 text-atelier'
                : 'bg-gray-50 dark:bg-neutral-900/50 border-gray-200 dark:border-neutral-800 text-gray-600 dark:text-neutral-400 hover:border-atelier/60 hover:bg-atelier/5 dark:hover:bg-atelier/10 hover:text-black dark:hover:text-atelier'
            }`}
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d={CATEGORY_ICONS[cat]} />
            </svg>
            {CATEGORY_LABELS[cat]}
          </button>
        );
      })}
    </div>
  );
}

export function SortDropdown<T extends string>({
  sort,
  setSort,
  options,
}: {
  sort: T;
  setSort: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
}) {
  const { open, setOpen, ref } = useDropdown();
  const current = options.find((o) => o.value === sort) ?? options[0];

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <TriggerButton onClick={() => setOpen((v) => !v)} expanded={open}>
        {current.label}
      </TriggerButton>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-40 rounded-xl bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-neutral-800 shadow-xl z-40 p-1.5 animate-slide-up">
          {options.map((opt) => (
            <FilterOption
              key={opt.value}
              selected={sort === opt.value}
              onClick={() => { setSort(opt.value); setOpen(false); }}
              label={opt.label}
            />
          ))}
        </div>
      )}
    </div>
  );
}
