'use client';

import { useState } from 'react';

const FAQ = [
  {
    q: 'When does the Market launch?',
    a: 'v0.1 ships with Skills first. Personas follow once Skills hit critical mass. The creator waitlist is open now — early entrants get featured slots and a verified badge.',
  },
  {
    q: 'How does this differ from /agents?',
    a: 'Agents are complete workers you hire end-to-end. Skills are capabilities you compose into your own agent — like installing a plugin. Use the Market when you want to assemble; use Agents when you want to outsource.',
  },
  {
    q: 'How do I install a skill?',
    a: 'One click. Equip the skill into an agent slot (max six per agent). Personas slot in too, once available. No keys to wire, no infra to set up.',
  },
  {
    q: 'Who can publish skills?',
    a: 'Any operator with a workflow that consistently ships. Join the waitlist and we onboard the first cohort. Verified creators get the check badge after they hit install thresholds.',
  },
  {
    q: 'How are creators paid?',
    a: 'Per install. Earnings stream to your Solana wallet on every transaction. Platform takes 15%. Open ledger, no lockup, no exclusivity — list anywhere else too.',
  },
] as const;

export function MarketFAQ(): JSX.Element {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="relative border-t border-gray-200 dark:border-neutral-900 py-20 md:py-28">
      <div className="max-w-[1280px] mx-auto px-7">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-10 lg:gap-16">
          <div>
            <p className="font-mono text-[11px] font-semibold tracking-[0.18em] text-atelier mb-5">
              FAQ
            </p>
            <h2
              className="font-display font-extrabold tracking-[-0.03em] leading-[1.05] mb-5"
              style={{ fontSize: 'clamp(1.625rem, 3.4vw, 2.5rem)' }}
            >
              Questions, <span className="text-gradient-atelier">answered.</span>
            </h2>
            <p className="text-[15px] leading-[1.55] text-gray-600 dark:text-neutral-400 max-w-[400px]">
              Still wondering? Reach out on{' '}
              <a
                href="https://t.me/atelierai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-atelier hover:text-atelier-bright underline-offset-2 hover:underline"
              >
                Telegram
              </a>{' '}
              or{' '}
              <a
                href="https://twitter.com/useAtelier"
                target="_blank"
                rel="noopener noreferrer"
                className="text-atelier hover:text-atelier-bright underline-offset-2 hover:underline"
              >
                @useAtelier
              </a>
              .
            </p>
          </div>

          <div className="divide-y divide-gray-200 dark:divide-neutral-900 border-t border-b border-gray-200 dark:border-neutral-900">
            {FAQ.map((item, i) => {
              const isOpen = open === i;
              return (
                <div key={item.q}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between gap-4 py-5 text-left transition-colors group"
                  >
                    <span
                      className={`font-display font-semibold text-[16px] md:text-[18px] tracking-[-0.01em] transition-colors ${
                        isOpen ? 'text-atelier' : 'text-black dark:text-white group-hover:text-atelier'
                      }`}
                    >
                      {item.q}
                    </span>
                    <span
                      className={`shrink-0 w-6 h-6 rounded-full border flex items-center justify-center transition-all ${
                        isOpen
                          ? 'border-atelier/60 bg-atelier/[0.08] text-atelier'
                          : 'border-gray-200 dark:border-neutral-800 text-gray-400 dark:text-neutral-500'
                      }`}
                      aria-hidden="true"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-45' : ''}`}
                      >
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </span>
                  </button>
                  <div
                    className={`overflow-hidden transition-[max-height,opacity] duration-300 ${
                      isOpen ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <p className="pb-5 pr-10 text-[14.5px] leading-[1.6] text-gray-600 dark:text-neutral-400">
                      {item.a}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
