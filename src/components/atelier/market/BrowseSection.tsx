'use client';

import { ITEMS, CATEGORIES } from './MarketData';
import { SkuCard } from './SkuCard';
import type { Item } from './MarketTypes';

interface BrowseSectionProps {
  filter: string;
  setFilter: (f: string) => void;
  sort: string;
  setSort: (s: string) => void;
  type: 'All' | 'Skills' | 'Personas';
  setType: (t: 'All' | 'Skills' | 'Personas') => void;
  onOpen: (item: Item) => void;
}

export function BrowseSection({
  filter,
  setFilter,
  sort,
  setSort,
  type,
  setType,
  onOpen,
}: BrowseSectionProps): JSX.Element {
  const filtered = ITEMS.filter((it) => {
    if (type === 'Skills' && it.kind !== 'skill') return false;
    if (type === 'Personas' && it.kind !== 'persona') return false;
    if (filter !== 'All' && it.cat !== filter) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'Price UP') return a.price - b.price;
    if (sort === 'Price DOWN') return b.price - a.price;
    if (sort === 'Rating') return b.rating - a.rating;
    return b.installs - a.installs;
  });

  const skillCount = ITEMS.filter((i) => i.kind === 'skill').length;
  const personaCount = ITEMS.filter((i) => i.kind === 'persona').length;

  const typeTabs: { k: 'All' | 'Skills' | 'Personas'; c: number }[] = [
    { k: 'All', c: ITEMS.length },
    { k: 'Skills', c: skillCount },
    { k: 'Personas', c: personaCount },
  ];

  return (
    <section style={{ position: 'relative', borderBottom: '1px solid var(--gray-border)' }}>
      <div style={{ maxWidth: 1360, margin: '0 auto', padding: '56px 28px 80px' }}>
        <div style={{ marginBottom: 22 }}>
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: 38,
              fontWeight: 700,
              letterSpacing: '-0.025em',
            }}
          >
            Browse the market
          </h2>
          <div style={{ color: 'var(--fg-3)', fontSize: 14, marginTop: 6 }}>
            Discover skills and personas to equip your agent.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
          {typeTabs.map((o) => {
            const on = type === o.k;
            return (
              <button
                key={o.k}
                onClick={() => setType(o.k)}
                style={{
                  background: on ? 'rgba(250,76,20,0.12)' : 'transparent',
                  color: on ? 'var(--atelier)' : 'var(--fg-2)',
                  border: `1px solid ${on ? 'rgba(250,76,20,0.55)' : 'var(--gray-border)'}`,
                  padding: '8px 14px',
                  borderRadius: 8,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.06em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                {o.k}
                <span
                  style={{
                    fontSize: 10,
                    padding: '1px 6px',
                    borderRadius: 3,
                    background: on ? 'rgba(250,76,20,0.18)' : 'rgba(255,255,255,0.04)',
                    color: on ? 'var(--atelier)' : 'var(--fg-4)',
                  }}
                >
                  {o.c}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 28 }}>
          {CATEGORIES.map((c) => {
            const on = filter === c;
            return (
              <button
                key={c}
                onClick={() => setFilter(c)}
                style={{
                  background: on ? 'var(--atelier)' : 'transparent',
                  color: on ? '#fff' : 'var(--fg-3)',
                  border: `1px solid ${on ? 'var(--atelier)' : 'var(--gray-border)'}`,
                  padding: '6px 13px',
                  borderRadius: 999,
                  fontSize: 12,
                  letterSpacing: '0.02em',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                {c}
              </button>
            );
          })}
        </div>

        <div
          className="grid-4"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 16,
          }}
        >
          {sorted.map((it) => (
            <SkuCard key={it.id} item={it} onOpen={onOpen} />
          ))}
        </div>

        <div
          style={{
            marginTop: 28,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--fg-4)',
            letterSpacing: '0.08em',
          }}
        >
          <span>
            Showing {sorted.length} of {ITEMS.length}
          </span>
          <span
            className="mk-link"
            style={{ color: 'var(--atelier)', fontWeight: 600, cursor: 'pointer' }}
          >
            Load more &#8594;
          </span>
        </div>
      </div>
    </section>
  );
}
