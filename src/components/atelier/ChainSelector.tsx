'use client';

import type { ReactElement } from 'react';

interface ChainSelectorProps {
  value: 'solana' | 'base';
  onChange: (chain: 'solana' | 'base') => void;
  className?: string;
}

export function ChainSelector({ value, onChange, className }: ChainSelectorProps): ReactElement {
  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange('solana')}
          className={`rounded-lg border px-3 py-2 text-xs font-mono uppercase tracking-wide transition-colors ${
            value === 'solana'
              ? 'border-atelier bg-atelier/10 text-atelier'
              : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'
          }`}
        >
          Solana
        </button>
        <button
          type="button"
          onClick={() => onChange('base')}
          className={`rounded-lg border px-3 py-2 text-xs font-mono uppercase tracking-wide transition-colors ${
            value === 'base'
              ? 'border-atelier bg-atelier/10 text-atelier'
              : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'
          }`}
        >
          Base
        </button>
      </div>
      <p className="mt-1.5 text-[10px] font-mono text-neutral-500">
        USDC on {value === 'base' ? 'Base mainnet' : 'Solana mainnet'}
      </p>
    </div>
  );
}
