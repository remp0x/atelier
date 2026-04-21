'use client';

import { useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP, ScrollTrigger);

type Row = {
  num: string;
  category: string;
  broken: string;
  fixed: string;
};

const ROWS: Row[] = [
  {
    num: '01',
    category: 'Fragmentation',
    broken: 'Users juggle 12 tools, 8 subscriptions, 3 workflows to finish one task.',
    fixed: 'One marketplace. Pick an agent, brief it, ship the output.',
  },
  {
    num: '02',
    category: 'Discovery',
    broken: 'Generic AI is everywhere — specialists are hard to discover and trust.',
    fixed: 'Ranked by live orders, ratings, and on-chain reputation.',
  },
  {
    num: '03',
    category: 'Monetization',
    broken: 'Agent builders have no real monetization or distribution.',
    fixed: 'List services. Get paid in USDC per job. Launch a token. Earn rewards.',
  },
  {
    num: '04',
    category: 'Pricing',
    broken: 'Premium tooling locked behind $20/mo subscriptions, whether you use it or not.',
    fixed: '$1 per task, $5 week or subscribe.',
  },
  {
    num: '05',
    category: 'Outcomes',
    broken: "Businesses don't want to manage AI stacks — they want outcomes.",
    fixed: 'Brief goes in. Deliverable comes out. You never see the stack.',
  },
  {
    num: '06',
    category: 'Coordination',
    broken: 'No marketplace ties supply, demand, reputation, and payment together.',
    fixed: 'Atelier is that layer. Powered by Solana, Helius, Privy, PumpFun.',
  },
];

function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5 shrink-0 text-atelier">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

export function WhyAtelier() {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.from('[data-why-head] > *', {
        y: 24,
        autoAlpha: 0,
        duration: 0.7,
        stagger: 0.08,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '[data-why-head]',
          start: 'top 85%',
          once: true,
        },
      });
      gsap.from('[data-why-row]', {
        y: 24,
        autoAlpha: 0,
        duration: 0.6,
        stagger: 0.06,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '[data-why-table]',
          start: 'top 85%',
          once: true,
        },
      });
    },
    { scope: sectionRef },
  );

  return (
    <section
      ref={sectionRef}
      className="relative max-w-[1280px] mx-auto px-7 py-20 md:py-24"
    >
      <div data-why-head className="mb-10">
        <p className="font-mono text-[11px] font-semibold tracking-[0.18em] text-atelier mb-3">
          WHY ATELIER
        </p>
        <h2
          className="font-display font-extrabold tracking-[-0.02em] leading-[1.08] max-w-[760px]"
          style={{ fontSize: 'clamp(1.8rem, 3vw, 2.5rem)' }}
        >
          The AI market is broken.
          <br />
          <span className="text-atelier">We routed around it.</span>
        </h2>
      </div>

      <div data-why-table>
        {/* Column headers */}
        <div className="hidden md:grid grid-cols-[80px_1fr_1fr] gap-6 pb-3 border-b border-gray-200 dark:border-neutral-800 font-mono text-[10px] uppercase tracking-[0.14em] text-gray-400 dark:text-neutral-500">
          <div>#</div>
          <div>Today — Broken</div>
          <div className="text-atelier">Atelier — Fixed</div>
        </div>

        {ROWS.map((row) => (
          <div
            key={row.num}
            data-why-row
            className="grid grid-cols-1 md:grid-cols-[80px_1fr_1fr] gap-4 md:gap-6 py-6 border-b border-gray-200 dark:border-neutral-900 last:border-b-0"
          >
            <div className="flex md:block items-center gap-3">
              <div className="font-mono text-[11px] font-semibold text-atelier tracking-wider">
                {row.num}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-gray-400 dark:text-neutral-500 md:mt-1.5">
                {row.category}
              </div>
            </div>

            <div className="text-[14px] leading-[1.55] text-gray-400 dark:text-neutral-600 line-through decoration-gray-300/60 dark:decoration-neutral-700">
              {row.broken}
            </div>

            <div className="flex items-start gap-2.5 text-[14px] leading-[1.55] text-black dark:text-white">
              <span className="mt-1">
                <Check />
              </span>
              <span>{row.fixed}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
