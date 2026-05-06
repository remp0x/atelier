'use client';

import { NEW_DROPS } from './MarketData';

export function NewDropsTicker(): JSX.Element {
  const items = [...NEW_DROPS, ...NEW_DROPS];

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderBottom: '1px solid var(--gray-border)',
        background:
          'linear-gradient(90deg, rgba(250,76,20,0.06), transparent 30%, transparent 70%, rgba(250,76,20,0.06))',
        height: 42,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          flexShrink: 0,
          padding: '0 16px',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          background: 'var(--atelier)',
          color: '#fff',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.2em',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        &#9679; NEW DROPS
      </div>
      <div
        style={{
          display: 'flex',
          gap: 48,
          whiteSpace: 'nowrap',
          animation: 'tickerRoll 40s linear infinite',
          paddingLeft: 24,
        }}
      >
        {items.map((name, i) => (
          <span
            key={i}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)', letterSpacing: '0.08em' }}
          >
            <span style={{ color: 'var(--atelier)' }}>&#9671;</span>&nbsp;&nbsp;{name}
            <span style={{ color: 'var(--fg-4)', marginLeft: 16 }}>&middot;</span>
          </span>
        ))}
      </div>
    </div>
  );
}
