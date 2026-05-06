'use client';

import Image from 'next/image';
import Link from 'next/link';

export function MarketNav(): JSX.Element {
  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        borderBottom: '1px solid var(--gray-border)',
        background: 'rgba(0,0,0,0.78)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        height: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 28px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Image src="/atelier_wb2.svg" alt="Atelier" width={22} height={22} style={{ borderRadius: 4 }} />
          <b style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, letterSpacing: '-0.01em' }}>
            Atelier
          </b>
          <span
            style={{
              marginLeft: 2,
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
        <div style={{ display: 'flex', gap: 24, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          {(['Browse', 'Skills', 'Personas', 'Creators', 'Docs'] as const).map((label, i) => (
            <span
              key={label}
              className="mk-link"
              style={{ color: i === 0 ? 'var(--atelier)' : 'var(--fg-3)', cursor: 'pointer' }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 12px',
            border: '1px solid var(--gray-border)',
            borderRadius: 6,
            width: 260,
            background: 'rgba(20,20,20,0.6)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--fg-4)',
          }}
        >
          <span>&#8981;</span>
          <span>Search 2,341 listings</span>
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 9,
              padding: '1px 5px',
              border: '1px solid var(--gray-border)',
              borderRadius: 3,
            }}
          >
            &#8984;K
          </span>
        </div>
        <button
          style={{
            background: 'transparent',
            color: 'var(--fg-3)',
            border: '1px solid var(--gray-border)',
            padding: '8px 16px',
            borderRadius: 4,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            cursor: 'pointer',
            transition: 'color 180ms ease, background 180ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--atelier)';
            e.currentTarget.style.background = 'rgba(250,76,20,0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--fg-3)';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          Sell a skill
        </button>
        <Link
          href="/agents"
          style={{
            background: 'var(--atelier)',
            color: '#fff',
            border: '1px solid transparent',
            padding: '8px 16px',
            borderRadius: 4,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            textDecoration: 'none',
            transition: 'background 180ms ease',
            display: 'inline-block',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'var(--atelier-bright)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'var(--atelier)';
          }}
        >
          Open App &#8594;
        </Link>
      </div>
    </nav>
  );
}
