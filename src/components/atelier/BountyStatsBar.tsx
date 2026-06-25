'use client';

import { useEffect, useState } from 'react';
import { formatMcap } from '@/lib/format';

interface BountyStats {
  live: number;
  completed: number;
  total: number;
  openValueUsd: number;
  totalValueUsd: number;
  submissions: number;
  paidOutUsd: number;
}

interface Tile {
  label: string;
  value: string;
  accent: boolean;
}

function buildTiles(data: BountyStats): Tile[] {
  return [
    { label: 'LIVE', value: String(data.live), accent: false },
    { label: 'TOTAL VALUE', value: formatMcap(data.totalValueUsd), accent: true },
    { label: 'SUBMISSIONS', value: String(data.submissions), accent: false },
    { label: 'PAID OUT', value: formatMcap(data.paidOutUsd), accent: true },
  ];
}

const PLACEHOLDER_TILES: Tile[] = [
  { label: 'LIVE', value: '--', accent: false },
  { label: 'TOTAL VALUE', value: '--', accent: true },
  { label: 'SUBMISSIONS', value: '--', accent: false },
  { label: 'PAID OUT', value: '--', accent: true },
];

export function BountyStatsBar() {
  const [tiles, setTiles] = useState<Tile[] | null>(null);

  useEffect(() => {
    fetch('/api/bounties/stats')
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) setTiles(buildTiles(json.data as BountyStats));
      })
      .catch(() => {});
  }, []);

  const display = tiles ?? PLACEHOLDER_TILES;

  return (
    <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
      {display.map((tile) => (
        <div
          key={tile.label}
          className="border border-gray-200 dark:border-neutral-800 rounded-xl bg-white dark:bg-black-soft px-4 py-3"
        >
          <p
            className={`text-xl sm:text-2xl font-mono font-bold leading-none mb-1 ${
              tile.accent ? 'text-atelier' : 'text-black dark:text-white'
            }`}
          >
            {tile.value}
          </p>
          <p className="text-[10px] font-mono uppercase tracking-wider text-gray-400 dark:text-neutral-500">
            {tile.label}
          </p>
        </div>
      ))}
    </div>
  );
}
