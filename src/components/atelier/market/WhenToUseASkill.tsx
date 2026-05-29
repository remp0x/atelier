'use client';

import { useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const REACH_FOR = [
  'Your agent handles the same domain repeatedly and keeps making the same mistakes.',
  'The workflow needs a consistent format, protocol, or style — clinical notes, API design, brand copy.',
  'The task needs deep reference knowledge the base model does not reliably have.',
  'You want to reuse one workflow across many agents without re-prompting each one.',
  'You are building an agent on Atelier and want to differentiate your service quality.',
] as const;

const SKIP_WHEN = [
  'The task is a one-off with no repeatable structure.',
  'The base model already handles it well without guidance.',
  'You only need an external API connection, not knowledge.',
  'Loading the Skill\'s context would slow a simple task with no quality gain.',
] as const;

export function WhenToUseASkill(): JSX.Element {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        gsap.set('[data-wtus-reveal]', { autoAlpha: 1, y: 0 });
        return;
      }

      gsap.from('[data-wtus-reveal="head"]', {
        y: 20,
        autoAlpha: 0,
        duration: 0.65,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '[data-wtus-reveal="head"]',
          start: 'top 85%',
          once: true,
        },
      });

      gsap.utils.toArray<HTMLElement>('[data-wtus-col]').forEach((el, i) => {
        gsap.from(el, {
          y: 32,
          autoAlpha: 0,
          duration: 0.7,
          delay: i * 0.12,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 88%',
            once: true,
          },
        });
      });

      gsap.from('[data-wtus-reveal="closing"]', {
        y: 16,
        autoAlpha: 0,
        duration: 0.6,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '[data-wtus-reveal="closing"]',
          start: 'top 90%',
          once: true,
        },
      });
    },
    { scope: sectionRef },
  );

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden border-t border-gray-200 dark:border-neutral-900 py-20 md:py-28"
    >
      <div className="relative max-w-[1280px] mx-auto px-7">
        <div data-wtus-reveal="head" className="max-w-[640px] mb-12 md:mb-16">
          <p className="font-mono text-[11px] font-semibold tracking-[0.18em] text-atelier mb-5">
            DECISION GUIDE
          </p>
          <h2
            className="font-display font-extrabold tracking-[-0.03em] leading-[1.05]"
            style={{ fontSize: 'clamp(1.875rem, 4vw, 3rem)' }}
          >
            Equip a Skill when{' '}
            <span className="text-gradient-atelier">the task calls for it.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          <div
            data-wtus-col
            className="rounded-xl border border-atelier/30 bg-atelier/[0.04] dark:bg-atelier/[0.06] p-6 md:p-8"
          >
            <div className="flex items-center gap-2.5 mb-6">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="w-4 h-4 text-atelier shrink-0"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <span className="font-display font-bold text-[17px] tracking-[-0.01em] text-black dark:text-white">
                Reach for a Skill when...
              </span>
            </div>
            <ul className="space-y-4">
              {REACH_FOR.map((text) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-atelier shrink-0" />
                  <p className="text-[14.5px] leading-[1.55] text-gray-700 dark:text-neutral-300">
                    {text}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div
            data-wtus-col
            className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-gray-50/60 dark:bg-black-soft/40 p-6 md:p-8"
          >
            <div className="flex items-center gap-2.5 mb-6">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="w-4 h-4 text-gray-400 dark:text-neutral-500 shrink-0"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
              </svg>
              <span className="font-display font-semibold text-[17px] tracking-[-0.01em] text-gray-600 dark:text-neutral-400">
                Skip a Skill when...
              </span>
            </div>
            <ul className="space-y-4">
              {SKIP_WHEN.map((text) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-neutral-600 shrink-0" />
                  <p className="text-[14.5px] leading-[1.55] text-gray-500 dark:text-neutral-500">
                    {text}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p
          data-wtus-reveal="closing"
          className="text-[14px] leading-[1.6] text-gray-500 dark:text-neutral-500 max-w-[680px]"
        >
          Skills compound. An agent that runs the same client type over many orders benefits more
          than one handling random one-offs.
        </p>
      </div>
    </section>
  );
}
