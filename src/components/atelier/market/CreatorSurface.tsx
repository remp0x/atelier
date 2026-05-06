'use client';

import { useState } from 'react';

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

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 6,
  border: '1px solid var(--gray-border)',
  background: 'var(--black)',
  color: 'var(--fg-1)',
  fontSize: 13,
  fontFamily: 'var(--font-sans)',
  outline: 'none',
  transition: 'border-color 160ms ease',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: 'var(--fg-4)',
          letterSpacing: '0.14em',
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

const STEPS = [
  {
    n: '01',
    t: 'Package',
    d: 'Drop a prompt bundle, tool config, or persona spec. We compile it into an installable capsule.',
  },
  { n: '02', t: 'Price', d: 'Free, one-time, or per-install. Changeable anytime. No exclusivity.' },
  {
    n: '03',
    t: 'Publish',
    d: 'Verified creators get the check badge and a featured slot rotation.',
  },
  {
    n: '04',
    t: 'Get paid',
    d: 'Earnings stream to your wallet on every install. Open ledger, no lockup.',
  },
] as const;

type PricingTier = 'free' | 'paid' | 'per';
type ListingKind = 'skill' | 'persona';

export function CreatorSurface(): JSX.Element {
  const [price, setPrice] = useState(12);
  const [kind, setKind] = useState<ListingKind>('skill');
  const [tier, setTier] = useState<PricingTier>('paid');
  const [name, setName] = useState('RFQ Negotiator');
  const [tagline, setTagline] = useState('Closes pricing loops without losing the deal.');

  const takeRate = tier === 'free' ? 0 : 12;
  const earn = Math.round(price * (1 - takeRate / 100) * 100) / 100;

  const previewMonogram = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  const kindTabs: { k: ListingKind; l: string }[] = [
    { k: 'skill', l: '◈ SKILL' },
    { k: 'persona', l: '☉ PERSONA' },
  ];

  const pricingTabs: { k: PricingTier; l: string }[] = [
    { k: 'free', l: 'FREE' },
    { k: 'paid', l: 'ONE-TIME' },
    { k: 'per', l: 'PER-INSTALL' },
  ];

  return (
    <section
      style={{
        position: 'relative',
        borderBottom: '1px solid var(--gray-border)',
        overflow: 'hidden',
      }}
    >
      <Aurora intensity={0.6} position="bottom" />
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          maxWidth: 1360,
          margin: '0 auto',
          padding: '80px 28px 96px',
        }}
      >
        <div
          className="creator-split"
          style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 56, alignItems: 'start' }}
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
              ◈ FRAME 05 · FOR CREATORS
            </div>
            <h2
              style={{
                margin: '10px 0 16px',
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(40px, 4.5vw, 60px)',
                letterSpacing: '-0.03em',
                lineHeight: 1.0,
              }}
            >
              Built a skill that works?
              <br />
              <span style={{ color: 'var(--atelier)' }}>Put it on the shelf.</span>
            </h2>
            <p style={{ color: 'var(--fg-3)', fontSize: 16, lineHeight: 1.6, maxWidth: 520 }}>
              Publish a persona or skill in under five minutes. Set your own price &#8212; or list it free.
              Every install settles in USDC on Solana. You keep 88%.
            </p>

            <ol
              style={{
                listStyle: 'none',
                padding: 0,
                margin: '32px 0 0',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              {STEPS.map((s) => (
                <li
                  key={s.n}
                  style={{ display: 'grid', gridTemplateColumns: '44px 1fr', gap: 16, alignItems: 'start' }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 800,
                      fontSize: 22,
                      color: 'var(--atelier)',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {s.n}
                  </span>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 17 }}>
                      {s.t}
                    </div>
                    <div style={{ color: 'var(--fg-3)', fontSize: 13, marginTop: 3, lineHeight: 1.5 }}>
                      {s.d}
                    </div>
                  </div>
                </li>
              ))}
            </ol>

            <div style={{ display: 'flex', gap: 10, marginTop: 30 }}>
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
                Start a listing &#8594;
              </button>
              <button
                style={{
                  background: 'transparent',
                  color: 'var(--fg-3)',
                  border: '1px solid var(--gray-border)',
                  padding: '14px 22px',
                  borderRadius: 4,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
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
                Creator docs
              </button>
            </div>
          </div>

          <div
            style={{
              border: '1px solid var(--gray-border)',
              borderRadius: 14,
              background: 'rgba(10,10,10,0.85)',
              backdropFilter: 'blur(10px)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--gray-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--fg-4)',
                letterSpacing: '0.14em',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: 'var(--atelier)',
                    display: 'inline-block',
                  }}
                />
                NEW LISTING · DRAFT
              </div>
              <span>AUTO-SAVED 00:02 AGO</span>
            </div>

            <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <Field label="LISTING TYPE">
                <div style={{ display: 'flex', gap: 6 }}>
                  {kindTabs.map(({ k, l }) => (
                    <button
                      key={k}
                      onClick={() => setKind(k)}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        borderRadius: 6,
                        border: `1px solid ${kind === k ? 'var(--atelier)' : 'var(--gray-border)'}`,
                        background: kind === k ? 'rgba(250,76,20,0.12)' : 'transparent',
                        color: kind === k ? 'var(--atelier)' : 'var(--fg-2)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        letterSpacing: '0.12em',
                        cursor: 'pointer',
                        transition: 'all 150ms ease',
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="NAME">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--atelier)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--gray-border)'; }}
                />
              </Field>

              <Field label="TAGLINE · ONE LINE">
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--atelier)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--gray-border)'; }}
                />
              </Field>

              <Field label="UPLOAD CAPSULE">
                <div
                  style={{
                    border: '1px dashed rgba(250,76,20,0.4)',
                    borderRadius: 8,
                    padding: 18,
                    background: 'rgba(250,76,20,0.04)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-1)' }}>
                      capsule.atelier · 14.2 KB
                    </div>
                    <div
                      style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)', marginTop: 3 }}
                    >
                      ✓ 4 tools · 2 prompts · 1 knowledge pack
                    </div>
                  </div>
                  <button
                    style={{
                      background: 'transparent',
                      color: 'var(--atelier)',
                      border: '1px solid rgba(250,76,20,0.60)',
                      padding: '7px 12px',
                      borderRadius: 4,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      cursor: 'pointer',
                      transition: 'all 180ms ease',
                    }}
                  >
                    Replace
                  </button>
                </div>
              </Field>

              <Field label="PRICING">
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  {pricingTabs.map(({ k, l }) => (
                    <button
                      key={k}
                      onClick={() => setTier(k)}
                      style={{
                        flex: 1,
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: `1px solid ${tier === k ? 'var(--atelier)' : 'var(--gray-border)'}`,
                        background: tier === k ? 'rgba(250,76,20,0.12)' : 'transparent',
                        color: tier === k ? 'var(--atelier)' : 'var(--fg-2)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        letterSpacing: '0.12em',
                        cursor: 'pointer',
                        transition: 'all 150ms ease',
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>

                {tier !== 'free' && (
                  <div
                    style={{
                      background: 'var(--black)',
                      border: '1px solid var(--gray-border)',
                      borderRadius: 8,
                      padding: 16,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'space-between',
                        marginBottom: 12,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 9,
                            color: 'var(--fg-4)',
                            letterSpacing: '0.14em',
                          }}
                        >
                          LIST PRICE
                        </div>
                        <div
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontWeight: 700,
                            fontSize: 40,
                            letterSpacing: '-0.02em',
                            color: 'var(--fg-1)',
                            marginTop: 2,
                          }}
                        >
                          {price}{' '}
                          <span style={{ color: 'var(--atelier)', fontSize: 18 }}>USDC</span>
                        </div>
                      </div>
                      <div
                        style={{
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 10,
                          color: 'var(--fg-3)',
                        }}
                      >
                        <div style={{ color: 'var(--fg-4)', letterSpacing: '0.14em' }}>YOU RECEIVE</div>
                        <div
                          style={{
                            color: 'var(--atelier)',
                            fontSize: 20,
                            fontFamily: 'var(--font-display)',
                            fontWeight: 700,
                            marginTop: 2,
                          }}
                        >
                          {earn} USDC
                        </div>
                        <div style={{ color: 'var(--fg-4)', marginTop: 2 }}>88% / install</div>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="99"
                      value={price}
                      onChange={(e) => setPrice(Number(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--atelier)' }}
                    />
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        color: 'var(--fg-4)',
                        marginTop: 4,
                      }}
                    >
                      <span>$0</span>
                      <span>$99</span>
                    </div>
                  </div>
                )}
              </Field>

              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    color: 'var(--fg-4)',
                    letterSpacing: '0.14em',
                    marginBottom: 8,
                  }}
                >
                  ◈ LIVE PREVIEW · HOW IT LISTS
                </div>
                <div
                  style={{
                    border: '1px solid rgba(250,76,20,0.3)',
                    borderRadius: 10,
                    background: 'linear-gradient(180deg, var(--black-soft), var(--black))',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: 110,
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background:
                        'repeating-linear-gradient(135deg, rgba(250,76,20,0.08) 0 2px, transparent 2px 14px), linear-gradient(135deg, rgba(250,76,20,0.04), rgba(255,122,61,0.03))',
                      border: '1px solid rgba(250,76,20,0.22)',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 30,
                        fontWeight: 700,
                        letterSpacing: '-0.03em',
                      }}
                    >
                      {previewMonogram || '??'}
                    </div>
                    <div
                      style={{
                        position: 'absolute',
                        top: 10,
                        left: 10,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        color: 'var(--atelier)',
                        letterSpacing: '0.14em',
                        border: '1px solid rgba(250,76,20,0.4)',
                        padding: '2px 7px',
                        borderRadius: 3,
                        background: 'rgba(0,0,0,0.5)',
                      }}
                    >
                      v0.1 · DRAFT
                    </div>
                  </div>
                  <div style={{ padding: 14 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        color: kind === 'persona' ? 'var(--fg-3)' : 'var(--atelier)',
                        letterSpacing: '0.14em',
                      }}
                    >
                      {kind === 'persona' ? '☉ PERSONA' : '◈ SKILL'} · YOUR CATEGORY
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 18,
                        fontWeight: 600,
                        marginTop: 6,
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {name || 'Untitled listing'}
                    </div>
                    <div style={{ color: 'var(--fg-3)', fontSize: 12, marginTop: 4, lineHeight: 1.45 }}>
                      {tagline || 'Add a one-line tagline to help buyers scan the shelf.'}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginTop: 14,
                        paddingTop: 10,
                        borderTop: '1px solid var(--border-soft)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        color: 'var(--fg-4)',
                      }}
                    >
                      <span>★ — · 0 installs</span>
                      <span
                        style={{
                          color: tier === 'free' ? 'var(--atelier)' : 'var(--fg-1)',
                          fontWeight: 600,
                        }}
                      >
                        {tier === 'free' ? 'FREE' : `${price} USDC`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

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
                  marginTop: 4,
                  transition: 'background 180ms ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--atelier-bright)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--atelier)'; }}
              >
                Publish listing →
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
