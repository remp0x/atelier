'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const POINTS = [
  {
    label: 'DEPOSIT',
    text: 'Move idle USDC from your Atelier wallet into any of ~24 Parquet markets -- US stocks and ETFs like NVDA, TSLA, and SPY, 24/7 on Solana.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-5 h-5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
    ),
  },
  {
    label: 'EARN',
    text: "LPs receive 60% of the pool's trading fees. Parquet's traders pay the fees; you earn from the flow.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-5 h-5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
  },
  {
    label: 'WITHDRAW',
    text: 'No lock-up, no withdrawal fee. Pull your deposit whenever you want.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-5 h-5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
      </svg>
    ),
  },
] as const;

function EarnVisual() {
  return (
    <div
      className="relative rounded-xl border border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-black-soft overflow-hidden"
      style={{ minHeight: '340px' }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(250,76,20,0.10), transparent 70%)',
      }} />

      <div className="absolute top-3.5 left-4 right-4 flex justify-between items-center z-[3]">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-gray-400 dark:text-neutral-500">
          Parquet Markets / USDC Pools
        </span>
        <span className="font-mono text-[10px] text-green-500 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          24/7 on Solana
        </span>
      </div>

      <div className="pt-12 pb-6 px-5 flex flex-col gap-2.5">
        <div className="mb-1">
          <div className="font-mono text-[10px] text-gray-500 dark:text-neutral-500 uppercase tracking-[0.12em] mb-2.5">Markets</div>
          <div className="flex flex-wrap gap-1.5">
            {['NVDA', 'TSLA', 'SPY', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'COIN'].map((ticker) => (
              <span
                key={ticker}
                className="font-mono text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 border border-gray-200 dark:border-neutral-700 rounded px-2 py-0.5 bg-white/70 dark:bg-neutral-900/60 cursor-default"
              >
                {ticker}
              </span>
            ))}
            <span className="font-mono text-[11px] text-gray-500 dark:text-neutral-500 border border-gray-200 dark:border-neutral-800 rounded px-2 py-0.5 bg-white/50 dark:bg-neutral-900/30 cursor-default">
              +16 more
            </span>
          </div>
        </div>

        <div className="mt-3 pt-3.5 border-t border-gray-200 dark:border-neutral-800 flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] text-gray-500 dark:text-neutral-500 uppercase tracking-[0.12em] mb-0.5">LP fee share</div>
            <div className="font-mono text-[18px] font-bold text-atelier">60%</div>
          </div>
          <div>
            <div className="font-mono text-[10px] text-gray-500 dark:text-neutral-500 uppercase tracking-[0.12em] mb-0.5 text-right">Withdrawal fee</div>
            <div className="font-mono text-[18px] font-bold text-black dark:text-white">$0</div>
          </div>
          <div>
            <div className="font-mono text-[10px] text-gray-500 dark:text-neutral-500 uppercase tracking-[0.12em] mb-0.5 text-right">Lock-up</div>
            <div className="font-mono text-[18px] font-bold text-black dark:text-white">None</div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-3 left-4 right-4 flex justify-between font-mono text-[10px] text-gray-400 dark:text-neutral-500 z-[3]">
        <span>~24 markets available at launch</span>
        <span className="text-atelier">powered by Parquet</span>
      </div>
    </div>
  );
}

export function EarnSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const visualRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      gsap.from('[data-earn-copy] > *', {
        y: 24,
        autoAlpha: 0,
        duration: 0.7,
        stagger: 0.08,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '[data-earn-copy]',
          start: 'top 82%',
          once: true,
        },
      });

      gsap.from('[data-earn-visual]', {
        y: 40,
        autoAlpha: 0,
        duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '[data-earn-visual]',
          start: 'top 80%',
          once: true,
        },
      });

      if (!reduced && visualRef.current && sectionRef.current) {
        gsap.fromTo(
          visualRef.current,
          { yPercent: 6 },
          {
            yPercent: -6,
            ease: 'none',
            scrollTrigger: {
              trigger: sectionRef.current,
              start: 'top bottom',
              end: 'bottom top',
              scrub: 1.2,
            },
          },
        );
      }
    },
    { scope: sectionRef },
  );

  return (
    <section
      id="earn"
      ref={sectionRef}
      className="relative py-20 md:py-24 overflow-hidden"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(250,76,20,0.10), transparent 65%)',
        }}
      />

      <div className="relative max-w-[1280px] mx-auto px-7">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-10 lg:gap-14 items-center">

          <div data-earn-copy>
            <p className="font-mono text-[11px] font-semibold tracking-[0.18em] text-atelier mb-3 flex items-center gap-2">
              ATELIER EARN
              <span className="inline-flex items-center h-4 px-1.5 rounded border border-atelier/40 bg-atelier/5 font-mono text-[9px] font-semibold tracking-[0.14em] text-atelier">
                BETA
              </span>
            </p>
            <h2
              className="font-display font-extrabold tracking-[-0.02em] leading-[1.08] mb-4"
              style={{ fontSize: 'clamp(1.8rem, 3vw, 2.5rem)' }}
            >
              Your idle USDC earns.
              <br />
              Put it to work.
            </h2>
            <p className="text-[15px] leading-[1.6] text-gray-600 dark:text-neutral-300 max-w-[480px] mb-6">
              Deposit from your Atelier wallet into a Parquet liquidity pool and earn a share of that market&apos;s trading fees. Withdraw anytime. No deposit or withdrawal fee.
            </p>

            <ul className="flex flex-col gap-4 mb-7">
              {POINTS.map(({ label, text, icon }) => (
                <li key={label} className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0 w-8 h-8 rounded-md flex items-center justify-center border border-atelier/30 text-atelier bg-atelier/5">
                    {icon}
                  </div>
                  <div>
                    <span className="block font-mono text-[10px] font-semibold tracking-[0.14em] text-atelier mb-0.5">
                      {label}
                    </span>
                    <span className="text-[13px] leading-[1.55] text-gray-500 dark:text-neutral-400">
                      {text}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            <Link
              href="/earn"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded bg-atelier text-white font-mono text-[12px] font-medium tracking-wide cursor-pointer transition-all duration-150 hover:bg-atelier-bright hover:shadow-[0_0_20px_rgba(250,76,20,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              Explore Earn →
            </Link>

          </div>

          <div data-earn-visual ref={visualRef} className="will-change-transform">
            <EarnVisual />
          </div>

        </div>
      </div>
    </section>
  );
}
