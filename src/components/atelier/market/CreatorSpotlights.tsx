'use client';

import { CREATORS } from './MarketData';
import type { Creator, Item } from './MarketTypes';

interface CreatorSpotlightsProps {
  onOpen: (item: Item) => void;
}

function CStat({ n, l, accent }: { n: string | number; l: string; accent?: boolean }) {
  return (
    <div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: accent ? 'var(--atelier)' : 'var(--fg-1)',
          fontFamily: 'var(--font-display)',
          letterSpacing: '-0.01em',
        }}
      >
        {n}
      </div>
      <div
        style={{
          fontSize: 9,
          color: 'var(--fg-4)',
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          marginTop: 2,
          fontFamily: 'var(--font-mono)',
        }}
      >
        {l}
      </div>
    </div>
  );
}

function CreatorCard({ c, i }: { c: Creator; i: number }) {
  return (
    <div
      className="sku-card"
      style={{
        position: 'relative',
        padding: 18,
        borderRadius: 12,
        border: '1px solid var(--gray-border)',
        background: 'var(--black-soft)',
        cursor: 'pointer',
        overflow: 'hidden',
        minHeight: 220,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 6,
          background: `linear-gradient(90deg, var(--atelier) ${(i + 1) * 20}%, transparent)`,
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 8,
            background: 'linear-gradient(135deg, var(--atelier), var(--atelier-dark))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 18,
            color: '#fff',
            letterSpacing: '-0.02em',
            boxShadow: '0 6px 14px -4px rgba(250,76,20,0.55)',
          }}
        >
          {c.name.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17 }}>
            {c.name}{' '}
            {c.verified && <span style={{ color: 'var(--atelier)', fontSize: 12 }}>&#10003;</span>}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-4)' }}>
            <span style={{ color: 'var(--atelier)' }}>@</span>
            {c.handle}
          </div>
        </div>
      </div>

      <div style={{ color: 'var(--fg-2)', fontSize: 13, marginTop: 14, lineHeight: 1.5 }}>
        {c.blurb}
      </div>

      <div
        style={{
          marginTop: 'auto',
          paddingTop: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          borderTop: '1px solid var(--border-soft)',
        }}
      >
        <CStat n={c.items} l="items" />
        <CStat n={c.installs} l="installs" />
        <CStat n={c.earned} l="earned" accent />
      </div>
    </div>
  );
}

export function CreatorSpotlights({ onOpen: _onOpen }: CreatorSpotlightsProps): JSX.Element {
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
              &#9672; FRAME 03 &middot; WHO MAKES THIS STUFF
            </div>
            <h2
              style={{
                margin: '10px 0 6px',
                fontFamily: 'var(--font-display)',
                fontSize: 44,
                letterSpacing: '-0.025em',
              }}
            >
              Creator spotlights.
            </h2>
            <div style={{ color: 'var(--fg-3)', fontSize: 15, maxWidth: 580 }}>
              The operators shipping the best-selling upgrades. Verified runs, real installs, open creator pages.
            </div>
          </div>
          <span
            className="mk-link"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--atelier)',
              letterSpacing: '0.12em',
              cursor: 'pointer',
            }}
          >
            ALL 418 CREATORS &#8594;
          </span>
        </div>

        <div
          className="grid-4"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}
        >
          {CREATORS.map((c, i) => (
            <CreatorCard key={c.handle} c={c} i={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
