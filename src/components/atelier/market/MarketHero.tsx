'use client';

import type { Item } from './MarketTypes';

interface MarketHeroProps {
  onOpen: (item: Item) => void;
}

function Aurora({ intensity = 1, position = 'top' }: { intensity?: number; position?: 'top' | 'bottom' }) {
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
          background: positions[position] ?? positions.top,
          filter: 'blur(10px)',
        }}
      />
    </div>
  );
}

function HeroFrameMarks() {
  const mark: React.CSSProperties = {
    position: 'absolute',
    fontFamily: 'var(--font-mono)',
    fontSize: 9,
    color: 'var(--fg-4)',
    letterSpacing: '0.15em',
  };
  return (
    <>
      <div style={{ ...mark, top: 20, left: 28 }}>A//MRKT &#8212; 01</div>
      <div style={{ ...mark, top: 20, right: 28 }}>{new Date().getUTCFullYear()} &middot; SHIPPED OPEN</div>
      <div style={{ ...mark, bottom: 20, left: 28 }}>&#9672; EQUIP &middot; &#9671; TRY &middot; &#9689; SHIP</div>
      <div style={{ ...mark, bottom: 20, right: 28 }}>FRAME 01/04</div>
    </>
  );
}

function HeroStat({ n, l, accent }: { n: string; l: string; accent?: boolean }) {
  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 28,
          letterSpacing: '-0.02em',
          color: accent ? 'var(--atelier)' : 'var(--fg-1)',
        }}
      >
        {n}
      </div>
      <div
        style={{
          color: 'var(--fg-4)',
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          marginTop: 6,
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
        }}
      >
        {l}
      </div>
    </div>
  );
}

const CAPSULE_SLOT_LABELS = ['PERSONA', 'SKILL', 'SKILL', 'SKILL', 'TOOL', 'KB'] as const;

function CapsuleStage() {
  const capsules = [
    { t: 'The Critic',          sub: 'PERSONA', x: 6,  y: 8,  r: -6, c: 'hot'  },
    { t: 'Deep-Dive Research',  sub: 'SKILL',   x: 52, y: 2,  r: 4,  c: 'hot'  },
    { t: 'The Concierge',       sub: 'PERSONA', x: 70, y: 38, r: -3, c: 'cool' },
    { t: 'Outbound Copy',       sub: 'SKILL',   x: 4,  y: 46, r: 6,  c: 'cool' },
    { t: 'Portfolio Rebal.',    sub: 'SKILL',   x: 38, y: 66, r: -2, c: 'hot'  },
    { t: 'The Strategist',      sub: 'PERSONA', x: 74, y: 70, r: 5,  c: 'cool' },
  ] as const;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        border: '1px solid var(--gray-border)',
        borderRadius: 14,
        background: 'linear-gradient(180deg, #070707, #0b0806)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(250,76,20,0.06) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(250,76,20,0.06) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          maskImage: 'radial-gradient(ellipse at center, black 55%, transparent 95%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: 120,
          background: 'linear-gradient(180deg, transparent, rgba(250,76,20,0.08), transparent)',
          animation: 'scan 6s linear infinite',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 14,
          left: 14,
          right: 14,
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--fg-3)',
          letterSpacing: '0.14em',
        }}
      >
        <span>&#9672; AGENT LOADOUT</span>
        <span style={{ color: 'var(--atelier)', animation: 'flicker 4s infinite' }}>&#9679; LIVE &middot; SLOT 03 / 06</span>
      </div>

      {capsules.map((c, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${c.x}%`,
            top: `${c.y}%`,
            ['--r' as string]: `${c.r}deg`,
            animation: `capsulePulse ${4 + i * 0.5}s ease-in-out infinite`,
            animationDelay: `${i * 0.3}s`,
          }}
        >
          <Capsule t={c.t} sub={c.sub} hot={c.c === 'hot'} />
        </div>
      ))}

      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 230,
          padding: '16px 18px',
          background: 'rgba(0,0,0,0.82)',
          border: '1px solid rgba(250,76,20,0.55)',
          borderRadius: 10,
          boxShadow: '0 0 40px rgba(250,76,20,0.25), inset 0 0 0 1px rgba(250,76,20,0.1)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--fg-4)',
            letterSpacing: '0.14em',
          }}
        >
          <span>AGENT &middot; MARA</span>
          <span>TIER II</span>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 20,
            marginTop: 8,
            letterSpacing: '-0.02em',
          }}
        >
          Analyst, growth-side
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', marginTop: 4 }}>
          owner &middot; <span style={{ color: 'var(--atelier)' }}>dash.sol</span>
        </div>
        <div
          style={{
            marginTop: 14,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 6,
          }}
        >
          {CAPSULE_SLOT_LABELS.map((s, i) => (
            <div
              key={i}
              style={{
                height: 34,
                borderRadius: 4,
                border: '1px dashed rgba(250,76,20,0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: i < 4 ? 'var(--atelier)' : 'var(--fg-4)',
                letterSpacing: '0.1em',
                background: i < 4 ? 'rgba(250,76,20,0.08)' : 'transparent',
                animation: i === 4 ? 'slotBlink 1.6s ease-in-out infinite' : 'none',
              }}
            >
              {i < 4 ? `◉ ${s}` : s}
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 12,
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--fg-4)',
          }}
        >
          <span>+ equip another &#8594;</span>
          <span>4 / 6 slots</span>
        </div>
      </div>
    </div>
  );
}

function Capsule({ t, sub, hot }: { t: string; sub: string; hot: boolean }) {
  return (
    <div
      style={{
        padding: '8px 12px 8px 8px',
        borderRadius: 999,
        background: hot ? 'rgba(250,76,20,0.14)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${hot ? 'rgba(250,76,20,0.55)' : 'var(--gray-border)'}`,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        boxShadow: hot ? '0 0 24px rgba(250,76,20,0.25)' : 'none',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          background: hot ? 'var(--atelier)' : '#1a1a1a',
          border: `1px solid ${hot ? 'var(--atelier-bright)' : 'var(--gray-border)'}`,
          boxShadow: hot ? 'inset 0 0 8px rgba(255,255,255,0.4)' : 'none',
        }}
      />
      <div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 8,
            color: hot ? 'var(--atelier-bright)' : 'var(--fg-4)',
            letterSpacing: '0.14em',
          }}
        >
          {sub}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 12,
            marginTop: 1,
            color: 'var(--fg-1)',
          }}
        >
          {t}
        </div>
      </div>
    </div>
  );
}

export function MarketHero({ onOpen: _onOpen }: MarketHeroProps): JSX.Element {
  return (
    <section
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderBottom: '1px solid var(--gray-border)',
      }}
    >
      <Aurora intensity={1.1} position="top" />
      <HeroFrameMarks />

      <div
        style={{
          position: 'relative',
          zIndex: 2,
          maxWidth: 1360,
          margin: '0 auto',
          padding: '72px 28px 96px',
        }}
      >
        <div
          className="hero-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1.05fr 0.95fr',
            gap: 56,
            alignItems: 'center',
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 24,
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--atelier)',
                  border: '1px solid rgba(250,76,20,0.55)',
                  padding: '4px 9px',
                  borderRadius: 4,
                  letterSpacing: '0.14em',
                }}
              >
                NEW VERTICAL &middot; ATELIER//MARKET
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--fg-4)',
                  letterSpacing: '0.12em',
                }}
              >
                V0.1 &middot; OPEN BETA
              </span>
            </div>

            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 'clamp(48px, 6.4vw, 96px)',
                lineHeight: 0.94,
                letterSpacing: '-0.035em',
                margin: 0,
              }}
            >
              Buy proven
              <br />
              <span style={{ color: 'var(--atelier)' }}>personas &amp; skills</span>
              <br />
              that make your agent
              <br />
              <span style={{ fontStyle: 'italic', fontWeight: 500, color: 'var(--fg-2)' }}>
                ready for real work.
              </span>
            </h1>

            <p
              style={{
                fontFamily: 'var(--font-sans)',
                color: 'var(--fg-3)',
                fontSize: 17,
                lineHeight: 1.55,
                maxWidth: 520,
                marginTop: 26,
              }}
            >
              A storefront for agent upgrades. One-click capabilities, personality packs, specialized
              knowledge, prompt bundles, tool integrations &#8212; shipped by operators who ran them in
              production.
            </p>

            <div style={{ display: 'flex', gap: 10, marginTop: 30, flexWrap: 'wrap' }}>
              <button
                style={{
                  background: 'var(--atelier)',
                  color: '#fff',
                  border: '1px solid transparent',
                  padding: '14px 22px',
                  borderRadius: 4,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'background 180ms ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--atelier-bright)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--atelier)'; }}
              >
                Browse the market &#8594;
              </button>
              <button
                style={{
                  background: 'transparent',
                  color: 'var(--atelier)',
                  border: '1px solid rgba(250,76,20,0.60)',
                  padding: '14px 22px',
                  borderRadius: 4,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'all 180ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--atelier)';
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--atelier)';
                }}
              >
                List a skill
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 36,
                marginTop: 44,
                flexWrap: 'wrap',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
              }}
            >
              <HeroStat n="2,341" l="Listings live" />
              <HeroStat n="418" l="Verified creators" />
              <HeroStat n="94,820" l="Installs this month" />
              <HeroStat n="USDC" l="Settlement" accent />
            </div>
          </div>

          <div className="hero-capsule-stage" style={{ position: 'relative', height: 560 }}>
            <CapsuleStage />
          </div>
        </div>
      </div>
    </section>
  );
}
