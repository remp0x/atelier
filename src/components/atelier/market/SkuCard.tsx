'use client';

import type { Item } from './MarketTypes';

export function glyphFor(item: Item): string {
  const parts = item.name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return item.name.slice(0, 2).toUpperCase();
}

export function formatN(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function PreviewPanel({ item }: { item: Item }) {
  const isPersona = item.kind === 'persona';
  return (
    <div
      style={{
        position: 'relative',
        height: 132,
        overflow: 'hidden',
        borderBottom: '1px solid var(--border-soft)',
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
        className="sku-preview-glow"
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0,
          transition: 'opacity 300ms ease',
          background: 'radial-gradient(circle at 50% 60%, rgba(250,76,20,0.25), transparent 60%)',
          pointerEvents: 'none',
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
            fontSize: 56,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            color: 'var(--fg-1)',
          }}
        >
          {glyphFor(item)}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: 'var(--fg-3)',
          letterSpacing: '0.1em',
          border: '1px solid var(--gray-border)',
          padding: '2px 7px',
          borderRadius: 3,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
        }}
      >
        {item.version}
      </div>
      {item.price === 0 && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: '#fff',
            letterSpacing: '0.1em',
            background: 'var(--atelier)',
            padding: '2px 7px',
            borderRadius: 3,
            fontWeight: 700,
          }}
        >
          FREE
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          bottom: 10,
          left: 12,
          right: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--fg-4)',
          letterSpacing: '0.04em',
        }}
      >
        <span>
          <span style={{ color: 'var(--atelier)' }}>@</span>
          {item.creator}
        </span>
      </div>
    </div>
  );
}

interface SkuCardProps {
  item: Item;
  onOpen: (item: Item) => void;
}

export function SkuCard({ item, onOpen }: SkuCardProps): JSX.Element {
  const priceLabel = item.price === 0 ? 'Free' : `${item.price} ${item.currency}`;
  const isPersona = item.kind === 'persona';

  return (
    <div
      className="sku-card"
      onClick={() => onOpen(item)}
      style={{
        position: 'relative',
        borderRadius: 12,
        border: '1px solid var(--gray-border)',
        background: 'var(--black-soft)',
        cursor: 'pointer',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <PreviewPanel item={item} />

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 16,
              letterSpacing: '-0.01em',
            }}
          >
            {item.name}
          </div>
          {item.verified && (
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: 999,
                background: 'var(--blue-check)',
                color: '#000',
                fontSize: 9,
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              &#10003;
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              padding: '3px 8px',
              borderRadius: 4,
              background: isPersona ? 'rgba(255,255,255,0.06)' : 'rgba(250,76,20,0.14)',
              color: isPersona ? 'var(--fg-2)' : 'var(--atelier)',
              border: `1px solid ${isPersona ? 'var(--gray-border)' : 'rgba(250,76,20,0.35)'}`,
              letterSpacing: '0.04em',
              fontWeight: 600,
            }}
          >
            {isPersona ? 'Persona' : 'Skill'}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              padding: '3px 8px',
              borderRadius: 4,
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--fg-3)',
              border: '1px solid var(--gray-border)',
              letterSpacing: '0.04em',
            }}
          >
            {item.cat}
          </span>
        </div>

        <div style={{ color: 'var(--fg-3)', fontSize: 12, lineHeight: 1.45, minHeight: 34 }}>
          {item.tagline}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 10,
            marginTop: 'auto',
            borderTop: '1px solid var(--border-soft)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--fg-4)',
                letterSpacing: '0.1em',
              }}
            >
              FROM
            </span>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 15,
                color: item.price === 0 ? 'var(--atelier)' : 'var(--fg-1)',
              }}
            >
              {priceLabel}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)' }}>
              &#9733; {item.rating}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', letterSpacing: '0.06em' }}>
              {formatN(item.installs)} installs
            </span>
          </div>
          <button
            className="sku-buy"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(item);
            }}
            style={{
              padding: '7px 14px',
              borderRadius: 6,
              border: '1px solid rgba(250,76,20,0.55)',
              background: 'transparent',
              color: 'var(--atelier)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.04em',
              cursor: 'pointer',
              transition: 'all 180ms ease',
            }}
          >
            Equip
          </button>
        </div>
      </div>
    </div>
  );
}
