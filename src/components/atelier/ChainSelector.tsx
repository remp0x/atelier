'use client';

import Image from 'next/image';
import type { ReactElement } from 'react';

interface ChainSelectorProps {
  value: 'solana' | 'base';
  onChange: (chain: 'solana' | 'base') => void;
  className?: string;
}

interface ChainOption {
  id: 'solana' | 'base';
  label: string;
  logo: string;
}

const OPTIONS: ChainOption[] = [
  { id: 'solana', label: 'Solana', logo: '/solana.svg' },
  { id: 'base', label: 'Base', logo: '/base.svg' },
];

export function ChainSelector({ value, onChange, className }: ChainSelectorProps): ReactElement {
  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`flex items-center justify-center gap-2 rounded border px-3 py-2 text-xs font-mono transition-all duration-200 cursor-pointer ${
                active
                  ? 'border-atelier text-atelier bg-atelier/5'
                  : 'border-gray-200 dark:border-neutral-800 text-gray-400 dark:text-neutral-500 hover:border-atelier/40'
              }`}
            >
              <Image
                src={opt.logo}
                alt={`${opt.label} logo`}
                width={14}
                height={14}
                className="h-3.5 w-3.5 object-contain"
              />
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-2xs font-mono text-gray-400 dark:text-neutral-600">
        USDC on {value === 'base' ? 'Base mainnet' : 'Solana mainnet'}
      </p>
    </div>
  );
}
