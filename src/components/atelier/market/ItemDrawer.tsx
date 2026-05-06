'use client';

import { useEffect } from 'react';
import type { Item } from './MarketTypes';
import { glyphFor, formatN } from './SkuCard';

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

function DrawerPreviewHero({ item }: { item: Item }) {
  const isPersona = item.kind === 'persona';
  return (
    <div
      style={{
        position: 'relative',
        height: 280,
        overflow: 'hidden',
        background: isPersona
          ? 'linear-gradient(135deg, #141414 0%, #0a0a0a 100%)'
          : 'linear-gradient(135deg, rgba(250,76,20,0.10) 0%, #0a0a0a 70%)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.5,
          background: isPersona
            ? 'repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 16px)'
            : 'repeating-linear-gradient(135deg, rgba(250,76,20,0.05) 0 1px, transparent 1px 18px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 96,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            color: 'var(--fg-1)',
            opacity: 0.15,
          }}
        >
          {glyphFor(item)}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 48,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            color: 'var(--fg-1)',
          }}
        >
          {glyphFor(item)}
        </div>
      </div>
      <Aurora intensity={0.6} position="bottom" />
    </div>
  );
}

const SKILL_CONTENTS = [
  'Tool bundle with auth scaffolding',
  'Prompt chain + eval harness',
  'Knowledge pack, versioned',
  'Ship-grade runbooks & failure modes',
];

const PERSONA_CONTENTS = [
  'Tone + register profile (prompt-injectable)',
  'Decision heuristics & escalation rules',
  'Memory scaffolding — what it remembers across sessions',
  'Style exemplars drawn from live traces',
];

const REVIEWS = [
  { who: 'rhea.sol', q: '"Replaced three of my internal prompts. 40% less cleanup after runs."' },
  { who: 'ori.sol', q: '"The failure-mode docs alone are worth the price. Rare."' },
];

function DrawerBody({ item, onClose }: { item: Item; onClose: () => void }) {
  const price = item.price === 0 ? 'FREE' : `${item.price} ${item.currency}`;
  const vibeOrKb = item.kind === 'persona' ? item.vibes : (item.kb ?? '—');
  const vibeOrKbLabel = item.kind === 'persona' ? 'VIBE' : 'KB SIZE';
  const contents = item.kind === 'persona' ? PERSONA_CONTENTS : SKILL_CONTENTS;

  return (
    <div>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          padding: '14px 22px',
          borderBottom: '1px solid var(--gray-border)',
          background: 'rgba(6,6,6,0.92)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--fg-4)',
          letterSpacing: '0.14em',
        }}
      >
        <span>◈ LISTING · {item.id.toUpperCase()}</span>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: '1px solid var(--gray-border)',
            color: 'var(--fg-2)',
            padding: '5px 10px',
            borderRadius: 4,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            cursor: 'pointer',
          }}
        >
          CLOSE · ESC
        </button>
      </div>

      <DrawerPreviewHero item={item} />

      <div style={{ padding: '28px 28px 80px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              padding: '3px 8px',
              borderRadius: 3,
              background: item.kind === 'persona' ? 'rgba(255,255,255,0.06)' : 'rgba(250,76,20,0.15)',
              color: item.kind === 'persona' ? 'var(--fg-2)' : 'var(--atelier)',
              border: `1px solid ${item.kind === 'persona' ? 'var(--gray-border)' : 'rgba(250,76,20,0.4)'}`,
              letterSpacing: '0.14em',
            }}
          >
            {item.kind === 'persona' ? '☉ PERSONA' : '◈ SKILL'}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--fg-4)',
              letterSpacing: '0.14em',
              alignSelf: 'center',
            }}
          >
            {item.cat.toUpperCase()} · {item.version}
          </span>
          {item.verified && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                padding: '3px 8px',
                borderRadius: 3,
                background: 'rgba(250,76,20,0.15)',
                color: 'var(--atelier)',
                border: '1px solid rgba(250,76,20,0.4)',
                letterSpacing: '0.14em',
              }}
            >
              ✓ VERIFIED
            </span>
          )}
        </div>

        <h3
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 38,
            letterSpacing: '-0.025em',
            lineHeight: 1.05,
          }}
        >
          {item.name}
        </h3>
        <div style={{ color: 'var(--fg-3)', fontSize: 15, marginTop: 8, lineHeight: 1.55 }}>
          {item.tagline}
        </div>

        <div
          style={{
            marginTop: 22,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: 14,
            border: '1px solid var(--gray-border)',
            borderRadius: 10,
            background: 'var(--black-soft)',
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 6,
              background: 'linear-gradient(135deg, var(--atelier), var(--atelier-dark))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 14,
              color: '#fff',
              flexShrink: 0,
            }}
          >
            {item.creatorLabel.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15 }}>
              {item.creatorLabel}{' '}
              {item.verified && <span style={{ color: 'var(--atelier)' }}>✓</span>}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-4)' }}>
              <span style={{ color: 'var(--atelier)' }}>@</span>
              {item.creator}
            </div>
          </div>
          <button
            style={{
              background: 'transparent',
              color: 'var(--fg-3)',
              border: '1px solid var(--gray-border)',
              padding: '6px 12px',
              borderRadius: 4,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              cursor: 'pointer',
              transition: 'color 180ms ease',
            }}
          >
            View creator →
          </button>
        </div>

        <div
          style={{
            marginTop: 20,
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 1,
            background: 'var(--gray-border)',
            border: '1px solid var(--gray-border)',
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          {[
            ['INSTALLS', formatN(item.installs)],
            ['RATING', `★ ${item.rating}`],
            [vibeOrKbLabel, vibeOrKb ?? '—'],
            ['VERSION', item.version],
          ].map(([l, v]) => (
            <div key={l} style={{ background: 'var(--black-soft)', padding: '12px 14px' }}>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  color: 'var(--fg-4)',
                  letterSpacing: '0.14em',
                }}
              >
                {l}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 17,
                  fontWeight: 600,
                  marginTop: 4,
                  letterSpacing: '-0.01em',
                }}
              >
                {v}
              </div>
            </div>
          ))}
        </div>

        <h4
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 18,
            marginTop: 28,
            marginBottom: 12,
            fontWeight: 600,
          }}
        >
          {`What's inside`}
        </h4>
        <ul
          style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {contents.map((line, i) => (
            <li
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '20px 1fr',
                gap: 10,
                alignItems: 'start',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--fg-2)',
              }}
            >
              <span style={{ color: 'var(--atelier)', marginTop: 2 }}>◈</span>
              {line}
            </li>
          ))}
        </ul>

        <h4
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 18,
            marginTop: 28,
            marginBottom: 12,
            fontWeight: 600,
          }}
        >
          From operators who shipped it
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {REVIEWS.map((r, i) => (
            <div
              key={i}
              style={{
                padding: 14,
                border: '1px solid var(--gray-border)',
                borderRadius: 10,
                background: 'var(--black-soft)',
              }}
            >
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--fg-1)' }}>
                {r.q}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--fg-4)',
                  marginTop: 8,
                  letterSpacing: '0.12em',
                }}
              >
                <span style={{ color: 'var(--atelier)' }}>@</span>
                {r.who} · VERIFIED INSTALL
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          position: 'sticky',
          bottom: 0,
          zIndex: 2,
          borderTop: '1px solid var(--gray-border)',
          background: 'rgba(6,6,6,0.96)',
          backdropFilter: 'blur(12px)',
          padding: '14px 22px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div
            style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', letterSpacing: '0.14em' }}
          >
            PRICE
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 28,
              color: item.price === 0 ? 'var(--atelier)' : 'var(--fg-1)',
              letterSpacing: '-0.02em',
            }}
          >
            {price}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            style={{
              background: 'transparent',
              color: 'var(--atelier)',
              border: '1px solid rgba(250,76,20,0.60)',
              padding: '12px 18px',
              borderRadius: 4,
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all 180ms ease',
            }}
          >
            Try free run
          </button>
          <button
            style={{
              background: 'var(--atelier)',
              color: '#fff',
              border: '1px solid transparent',
              padding: '12px 22px',
              borderRadius: 4,
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              cursor: 'pointer',
              transition: 'background 180ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--atelier-bright)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--atelier)'; }}
          >
            {item.price === 0 ? 'Equip →' : 'Buy & equip →'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ItemDrawerProps {
  item: Item | null;
  onClose: () => void;
}

export function ItemDrawer({ item, onClose }: ItemDrawerProps): JSX.Element {
  const open = !!item;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.72)',
          backdropFilter: 'blur(6px)',
          zIndex: 180,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 240ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      />
      <aside
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100vh',
          width: 'min(640px, 100vw)',
          background: '#060606',
          borderLeft: '1px solid var(--gray-border)',
          zIndex: 181,
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1)',
          overflowY: 'auto',
        }}
      >
        {item && <DrawerBody item={item} onClose={onClose} />}
      </aside>
    </>
  );
}
