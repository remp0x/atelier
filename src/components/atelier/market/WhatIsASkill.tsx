'use client';

import { useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const COLUMNS = [
  {
    label: 'WHAT IT ENCODES',
    body: 'A Skill ships a system prompt, tool definitions, reference knowledge, and evals — everything an agent needs to handle a domain well. You drop in the Markdown file; the agent gains the context.',
  },
  {
    label: 'TOKEN EFFICIENT',
    body: "The agent loads only a Skill's name and description by default. The full knowledge payload activates only when the task calls for it. Unused Skills cost essentially nothing — no context bloat.",
  },
  {
    label: 'WHAT IT IS NOT',
    body: 'Not a plugin, an MCP server, or a workflow runner. It does not add new API access. It encodes how the agent should think and act within the tools it already has.',
  },
] as const;

export function WhatIsASkill(): JSX.Element {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        gsap.set('[data-wias-reveal]', { autoAlpha: 1, y: 0 });
        return;
      }

      gsap.from('[data-wias-reveal="head"]', {
        y: 20,
        autoAlpha: 0,
        duration: 0.65,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '[data-wias-reveal="head"]',
          start: 'top 85%',
          once: true,
        },
      });

      gsap.utils.toArray<HTMLElement>('[data-wias-col]').forEach((el, i) => {
        gsap.from(el, {
          y: 32,
          autoAlpha: 0,
          duration: 0.7,
          delay: i * 0.1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 88%',
            once: true,
          },
        });
      });
    },
    { scope: sectionRef },
  );

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden border-t border-gray-200 dark:border-neutral-900 py-20 md:py-28"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 60% 50% at 80% 0%, rgba(250,76,20,0.06), transparent 60%),
            radial-gradient(ellipse 50% 40% at 20% 100%, rgba(201,58,10,0.05), transparent 55%)
          `,
        }}
      />

      <div className="relative max-w-[1280px] mx-auto px-7">
        <div data-wias-reveal="head" className="max-w-[640px] mb-14 md:mb-16">
          <p className="font-mono text-[11px] font-semibold tracking-[0.18em] text-atelier mb-5">
            THE CONCEPT
          </p>
          <h2
            className="font-display font-extrabold tracking-[-0.03em] leading-[1.05]"
            style={{ fontSize: 'clamp(1.875rem, 4vw, 3rem)' }}
          >
            A Skill is{' '}
            <span className="text-gradient-atelier">packaged knowledge</span>
            {', '}not a plugin.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {COLUMNS.map((col, i) => (
            <div
              key={col.label}
              data-wias-col
              className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-gray-50/60 dark:bg-black-soft/60 backdrop-blur-md p-6 md:p-7"
            >
              <div className="font-mono text-[10px] tracking-[0.18em] text-atelier mb-4 flex items-center gap-2">
                <span className="text-gray-400 dark:text-neutral-600">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>{col.label}</span>
              </div>
              <p className="text-[14.5px] leading-[1.6] text-gray-600 dark:text-neutral-300">
                {col.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
