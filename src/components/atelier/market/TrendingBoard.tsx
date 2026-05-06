'use client';

import { ITEMS } from './MarketData';
import { formatN } from './SkuCard';
import type { Item } from './MarketTypes';

interface TrendingBoardProps {
  onOpen: (item: Item) => void;
}

const DELTAS = [12, -3, 8, 22, -1, 5, 44, 3];

export function TrendingBoard({ onOpen }: TrendingBoardProps): JSX.Element {
  const rows = [...ITEMS]
    .sort((a, b) => b.installs - a.installs)
    .slice(0, 8)
    .map((it, idx) => ({ it, idx, delta: DELTAS[idx] ?? 0 }));

  return (
    <section style={{ position: 'relative', borderBottom: '1px solid var(--gray-border)' }}>
      <div style={{ maxWidth: 1360, margin: '0 auto', padding: '72px 28px 80px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: 28,
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div>
            <div
              style={{
                color: 'var(--atelier)',
                letterSpacing: '0.18em',
                fontSize: 11,
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
              }}
            >
              &#9672; FRAME 04 &middot; WHAT AGENTS ARE EQUIPPING NOW
            </div>
            <h2
              style={{
                margin: '10px 0 6px',
                fontFamily: 'var(--font-display)',
                fontSize: 44,
                letterSpacing: '-0.025em',
              }}
            >
              The trending board.
            </h2>
            <div style={{ color: 'var(--fg-3)', fontSize: 15, maxWidth: 580 }}>
              Live installs across the last 24 hours, settled on-chain. No paid placement.
            </div>
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--atelier)',
              letterSpacing: '0.14em',
              border: '1px solid rgba(250,76,20,0.45)',
              padding: '8px 12px',
              borderRadius: 6,
              background: 'rgba(250,76,20,0.05)',
            }}
          >
            &#9679; LIVE &middot; UPDATES 60s
          </div>
        </div>

        <div
          style={{
            border: '1px solid var(--gray-border)',
            borderRadius: 12,
            overflow: 'hidden',
            background: 'linear-gradient(180deg, #080808, #050505)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '48px 1.8fr 140px 120px 120px 120px 100px',
              padding: '12px 20px',
              borderBottom: '1px solid var(--gray-border)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--fg-4)',
              letterSpacing: '0.14em',
            }}
          >
            <span>#</span>
            <span>LISTING</span>
            <span>CREATOR</span>
            <span>CATEGORY</span>
            <span>INSTALLS 24H</span>
            <span>&#916;</span>
            <span style={{ textAlign: 'right' }}>PRICE</span>
          </div>

          {rows.map(({ it, idx, delta }) => (
            <div
              key={it.id}
              className="row-hover"
              onClick={() => onOpen(it)}
              style={{
                display: 'grid',
                gridTemplateColumns: '48px 1.8fr 140px 120px 120px 120px 100px',
                padding: '14px 20px',
                borderBottom: idx < 7 ? '1px solid var(--border-soft)' : 'none',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--fg-2)',
                cursor: 'pointer',
                alignItems: 'center',
                transition: 'background 160ms ease',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: 20,
                  color: idx < 3 ? 'var(--atelier)' : 'var(--fg-4)',
                  letterSpacing: '-0.02em',
                }}
              >
                {String(idx + 1).padStart(2, '0')}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: 2,
                    background: it.kind === 'persona' ? 'var(--fg-3)' : 'var(--atelier)',
                  }}
                />
                <span
                  style={{
                    color: 'var(--fg-1)',
                    fontFamily: 'var(--font-display)',
                    fontSize: 15,
                    fontWeight: 600,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {it.name}
                </span>
                <span style={{ color: 'var(--fg-4)', fontSize: 10 }}>{it.version}</span>
              </div>
              <span>
                <span style={{ color: 'var(--atelier)' }}>@</span>
                {it.creator}
                {it.verified && <span style={{ marginLeft: 4, color: 'var(--atelier)' }}>&#10003;</span>}
              </span>
              <span style={{ color: 'var(--fg-3)' }}>{it.cat}</span>
              <span style={{ color: 'var(--fg-1)' }}>{formatN(Math.round(it.installs * 0.04))}</span>
              <span style={{ color: delta >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {delta >= 0 ? '&#9650;' : '&#9660;'} {Math.abs(delta)}%
              </span>
              <span
                style={{
                  textAlign: 'right',
                  color: it.price === 0 ? 'var(--atelier)' : 'var(--fg-1)',
                  fontWeight: 600,
                }}
              >
                {it.price === 0 ? 'FREE' : `${it.price} ${it.currency}`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
