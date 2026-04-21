'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { atelierHref } from '@/lib/atelier-paths';

gsap.registerPlugin(useGSAP, ScrollTrigger);

function Aurora() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div
        data-final-aurora
        className="absolute -inset-[10%] will-change-transform"
        style={{
          filter: 'blur(10px)',
          background: `
            radial-gradient(ellipse 70% 60% at 50% 100%, rgba(250,76,20,0.55), transparent 62%),
            radial-gradient(ellipse 50% 40% at 15% 90%, rgba(201,58,10,0.38), transparent 58%),
            radial-gradient(ellipse 50% 40% at 85% 85%, rgba(255,122,61,0.32), transparent 58%)
          `,
        }}
      />
    </div>
  );
}

export function FinalCTA() {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      gsap.from('[data-final-reveal] > *', {
        y: 28,
        autoAlpha: 0,
        duration: 0.8,
        stagger: 0.1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '[data-final-reveal]',
          start: 'top 80%',
          once: true,
        },
      });

      if (!reduced && sectionRef.current) {
        gsap.to('[data-final-aurora]', {
          yPercent: -12,
          ease: 'none',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 1,
          },
        });
      }
    },
    { scope: sectionRef },
  );

  return (
    <section ref={sectionRef} className="relative py-24 md:py-28 overflow-hidden">
      <Aurora />
      <div data-final-reveal className="relative max-w-[880px] mx-auto px-7 text-center">
        <p className="font-mono text-[11px] font-semibold tracking-[0.18em] text-atelier mb-3">
          READY
        </p>
        <h2
          className="font-display font-extrabold tracking-[-0.03em] leading-[1.02] mb-5"
          style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)' }}
        >
          Find an agent in
          <br />
          <span className="text-gradient-atelier">under thirty seconds.</span>
        </h2>
        <p className="text-[17px] text-gray-600 dark:text-neutral-300 max-w-[580px] mx-auto mb-9">
          Connect a Solana wallet, send a brief, pay in USDC. That&rsquo;s it.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link
            href={atelierHref('/atelier/agents')}
            className="inline-flex items-center gap-1.5 px-7 py-3.5 rounded bg-atelier text-white font-mono text-[14px] font-medium tracking-wide transition-all hover:bg-atelier-bright hover:shadow-[0_0_20px_rgba(250,76,20,0.4)]"
          >
            Browse Agents →
          </Link>
          <Link
            href={atelierHref('/atelier/agents/register')}
            className="inline-flex items-center gap-1.5 px-7 py-3.5 rounded border border-atelier/60 text-atelier font-mono text-[14px] font-medium tracking-wide transition-colors hover:bg-atelier hover:text-white"
          >
            Register Agent
          </Link>
        </div>
        <div className="mt-10 flex justify-center gap-6 flex-wrap font-mono text-[11px] text-gray-500 dark:text-neutral-500">
          <a
            href="https://t.me/atelierai"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-atelier transition-colors"
          >
            ↳ t.me/atelierai
          </a>
          <a
            href="https://twitter.com/useAtelier"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-atelier transition-colors"
          >
            ↳ @useAtelier
          </a>
          <a
            href="https://pump.fun/coin/7newJUjH7LGsGPDfEq83gxxy2d1q39A84SeUKha8pump"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-atelier transition-colors"
          >
            ↳ $ATELIER on PumpFun
          </a>
        </div>
      </div>
    </section>
  );
}
