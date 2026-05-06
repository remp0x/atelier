'use client';

import { useState } from 'react';
import Image from 'next/image';

function Aurora({ intensity = 1, position = 'bottom' }: { intensity?: number; position?: 'top' | 'bottom' }) {
  const positions: Record<string, string> = {
    top: `
      radial-gradient(ellipse 55% 55% at 18% 8%,  rgba(201,58,10,${0.45 * intensity}), transparent 55%),
      radial-gradient(ellipse 45% 45% at 82% 18%, rgba(255,122,61,${0.32 * intensity}), transparent 55%),
      radial-gradient(ellipse 70% 55% at 50% 100%, rgba(250,76,20,${0.38 * intensity}), transparent 62%)`,
    bottom: `
      radial-gradient(ellipse 70% 60% at 50% 100%, rgba(250,76,20,${0.50 * intensity}), transparent 62%),
      radial-gradient(ellipse 50% 40% at 15% 90%, rgba(201,58,10,${0.35 * intensity}), transparent 58%),
      radial-gradient(ellipse 50% 40% at 85% 85%, rgba(255,122,61,${0.30 * intensity}), transparent 58%)`,
  };
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: '-10%',
          background: positions[position] ?? positions.bottom,
          filter: 'blur(10px)',
        }}
      />
    </div>
  );
}

type LetterKey = 'A' | 'T' | 'E' | 'L' | 'I' | 'R';

interface LetterSpec {
  rects: [number, number, number, number][];
  poly: string;
  anchors: [number, number, string][];
}

const SPECS: Record<LetterKey, LetterSpec> = {
  A: {
    rects: [[12, 22, 34, 56], [56, 40, 30, 40]],
    poly: '50,8 18,92 50,62 82,92 50,8',
    anchors: [[50, 8, '18, 04'], [18, 92, '11, 96'], [82, 92, '84, 96']],
  },
  T: {
    rects: [[8, 10, 84, 18], [40, 28, 22, 64]],
    poly: '8,18 92,18 92,28 54,28 54,92 46,92 46,28 8,28 8,18',
    anchors: [[50, 18, '50, 14'], [50, 92, '50, 96']],
  },
  E: {
    rects: [[10, 10, 78, 16], [10, 44, 50, 14], [10, 78, 78, 16]],
    poly: '10,10 10,92 88,92 88,78 24,78 24,58 60,58 60,44 24,44 24,24 88,24 88,10',
    anchors: [[10, 10, '04, 06'], [88, 50, '92, 50'], [10, 92, '04, 96']],
  },
  L: {
    rects: [[10, 10, 20, 70], [10, 76, 78, 16]],
    poly: '10,10 24,10 24,78 88,78 88,92 10,92 10,10',
    anchors: [[10, 10, '04, 06'], [88, 92, '94, 96']],
  },
  I: {
    rects: [[30, 10, 40, 10], [42, 20, 16, 60], [30, 80, 40, 10]],
    poly: '30,10 70,10 70,20 58,20 58,80 70,80 70,92 30,92 30,80 42,80 42,20 30,20 30,10',
    anchors: [[50, 10, '50, 08'], [50, 92, '50, 94']],
  },
  R: {
    rects: [[14, 10, 48, 40], [14, 10, 20, 82], [50, 54, 32, 38]],
    poly: '14,10 14,92 26,92 26,54 48,54 72,92 88,92 62,50 70,40 70,22 60,10 14,10',
    anchors: [[14, 10, '06, 06'], [70, 30, '76, 30'], [88, 92, '92, 96']],
  },
};

const WORD = 'ATELIER';

function WireframeWordmark() {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        padding: '40px 28px 0',
        maxWidth: 1360,
        margin: '0 auto',
        userSelect: 'none',
      }}
    >
      <style>{`
        @keyframes wmDashRun { to { stroke-dashoffset: -40; } }
        @keyframes wmBlink   { 0%,70%,100% { opacity: 1 } 80% { opacity: 0.2 } }
        .wm-row {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: clamp(2px, 0.6vw, 8px);
          width: 100%;
        }
        .wm-cell {
          position: relative;
          aspect-ratio: 0.86 / 1;
          cursor: crosshair;
        }
        .wm-cell svg { display: block; width: 100%; height: 100%; overflow: visible; }
        .wm-letter {
          font-family: var(--font-display), sans-serif;
          font-weight: 800;
          font-size: 100px;
          letter-spacing: -0.04em;
          text-anchor: middle;
          dominant-baseline: central;
          fill: url(#wmSilver);
          transition: fill 200ms var(--ease-out), opacity 200ms var(--ease-out);
        }
        .wm-cell:hover .wm-letter { fill: url(#wmSilverDim); opacity: 0.65; }
        .wm-overlay { opacity: 0; transition: opacity 160ms var(--ease-out); pointer-events: none; }
        .wm-cell:hover .wm-overlay { opacity: 1; }
        .wm-rect {
          fill: none;
          stroke: var(--atelier);
          stroke-width: 0.6;
          stroke-dasharray: 2 2;
          animation: wmDashRun 3s linear infinite;
        }
        .wm-rect-solid { fill: none; stroke: var(--atelier); stroke-width: 0.5; stroke-dasharray: none; }
        .wm-poly {
          fill: none;
          stroke: var(--atelier-bright);
          stroke-width: 0.8;
          stroke-dasharray: 1 1.4;
          animation: wmDashRun 4s linear infinite;
        }
        .wm-anchor {
          fill: #000;
          stroke: var(--atelier);
          stroke-width: 0.8;
          animation: wmBlink 1.4s ease-in-out infinite;
        }
        .wm-label {
          font-family: var(--font-mono);
          font-size: 5.4px;
          fill: var(--atelier);
          letter-spacing: 0.06em;
        }
        .wm-tick {
          font-family: var(--font-mono);
          font-size: 4.2px;
          fill: var(--fg-4);
          letter-spacing: 0.08em;
        }
        .wm-rail {
          display: flex; justify-content: space-between; align-items: center;
          font-family: var(--font-mono); font-size: 10px; color: var(--fg-4);
          letter-spacing: 0.14em; text-transform: uppercase;
          border-bottom: 1px solid var(--border-soft);
          padding-bottom: 10px; margin-bottom: 18px;
        }
        .wm-readout { font-family: var(--font-mono); font-size: 10px; color: var(--fg-3); letter-spacing: 0.14em; }
        .wm-readout span { color: var(--atelier); }
      `}</style>

      <div className="wm-rail">
        <span>A//MRKT · WORDMARK · v01</span>
        <span className="wm-readout">
          HOVER <span>&#9658;</span>{' '}
          {hoverIdx !== null
            ? `${WORD[hoverIdx]} · glyph_${String(hoverIdx).padStart(2, '0')}`
            : 'idle'}
        </span>
        <span>GRID 7×1 · 100u</span>
      </div>

      <div className="wm-row">
        {WORD.split('').map((ch, i) => {
          const spec = SPECS[ch as LetterKey];
          return (
            <div
              key={i}
              className="wm-cell"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx((v) => (v === i ? null : v))}
            >
              <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
                <defs>
                  <linearGradient id={`wmSilver-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e8e8e8" />
                    <stop offset="45%" stopColor="#8a8a8a" />
                    <stop offset="55%" stopColor="#6a6a6a" />
                    <stop offset="100%" stopColor="#1a1a1a" />
                  </linearGradient>
                  <linearGradient id={`wmSilverDim-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2a2a2a" />
                    <stop offset="100%" stopColor="#0a0a0a" />
                  </linearGradient>
                </defs>

                <text
                  className="wm-letter"
                  style={{ fill: `url(#wmSilver-${i})` }}
                  x="50"
                  y="56"
                >
                  {ch}
                </text>

                {spec && (
                  <g className="wm-overlay">
                    <rect className="wm-rect-solid" x="2" y="2" width="96" height="96" />
                    <text className="wm-tick" x="2" y="99">0,0</text>
                    <text className="wm-tick" x="78" y="99">100,100</text>
                    {spec.rects.map((r, k) => (
                      <rect key={k} className="wm-rect" x={r[0]} y={r[1]} width={r[2]} height={r[3]} />
                    ))}
                    <polyline className="wm-poly" points={spec.poly} />
                    {spec.anchors.map((a, k) => (
                      <g key={k}>
                        <circle className="wm-anchor" cx={a[0]} cy={a[1]} r="1.4" />
                        <text
                          className="wm-label"
                          x={a[0] + (a[0] > 70 ? -2 : 3)}
                          y={a[1] + (a[1] > 70 ? -3 : 6)}
                          textAnchor={a[0] > 70 ? 'end' : 'start'}
                        >
                          {a[2]}
                        </text>
                      </g>
                    ))}
                    <text className="wm-label" x="50" y="10" textAnchor="middle">
                      glyph_{String(i).padStart(2, '0')}
                    </text>
                  </g>
                )}
              </svg>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const FOOTER_COLS = [
  { h: 'Market',  links: ['Browse', 'Skills', 'Personas', 'Trending', 'New drops'] },
  { h: 'Build',   links: ['Sell a skill', 'Creator docs', 'SDK', 'Protocol', 'Bounties'] },
  { h: 'Atelier', links: ['Main app', 'About', 'Brand', 'Press', 'Status'] },
] as const;

export function MarketFooter(): JSX.Element {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <footer style={{ borderTop: '1px solid var(--gray-border)', marginTop: 80, position: 'relative' }}>
      <Aurora intensity={0.4} position="bottom" />
      <WireframeWordmark />
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          maxWidth: 1360,
          margin: '0 auto',
          padding: '64px 28px 48px',
          display: 'grid',
          gridTemplateColumns: '1.2fr auto auto auto',
          gap: 48,
          alignItems: 'start',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <Image
              src="/atelier_wb2.svg"
              alt="Atelier"
              width={26}
              height={26}
              style={{ borderRadius: 4 }}
            />
            <b style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20 }}>Atelier</b>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--atelier)',
                border: '1px solid rgba(250,76,20,0.5)',
                padding: '2px 7px',
                borderRadius: 4,
                letterSpacing: '0.12em',
              }}
            >
              MARKET
            </span>
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 600,
              lineHeight: 1.2,
              maxWidth: 420,
              letterSpacing: '-0.02em',
            }}
          >
            Equip your agent. Ship the work.
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--fg-4)',
              marginTop: 18,
              lineHeight: 1.6,
            }}
          >
            Settled in USDC on Solana. Creators keep 88%. No take-rate on free listings.
          </div>
        </div>

        {FOOTER_COLS.map((col) => (
          <div key={col.h} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--fg-4)',
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
              }}
            >
              {col.h}
            </div>
            {col.links.map((l) => (
              <span
                key={l}
                className="mk-link"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-3)', cursor: 'pointer' }}
              >
                {l}
              </span>
            ))}
          </div>
        ))}
      </div>

      <div
        style={{
          borderTop: '1px solid var(--border-soft)',
          padding: '16px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--fg-4)',
          letterSpacing: '0.12em',
        }}
      >
        <span>© ATELIER · A//MRKT · EDITION 01</span>
        <span>{today} · ALL SYSTEMS NOMINAL ●</span>
      </div>
    </footer>
  );
}
