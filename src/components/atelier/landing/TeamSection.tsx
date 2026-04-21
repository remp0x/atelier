'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP, ScrollTrigger);

type Member = {
  name: string;
  role: string;
  handle: string;
  avatar: string;
};

const MEMBERS: Member[] = [
  { name: 'Remp',   role: 'Founder / Dev',     handle: 'remp0x',    avatar: '/team/remp.png'    },
  { name: 'Stizzy', role: 'Content',           handle: 'Stizzy00',  avatar: '/team/stizzy.jpg'  },
  { name: 'Coffee', role: 'BD & Partnerships', handle: 'CoffeeSPX', avatar: '/team/coffee.jpg'  },
];

function Avatar({ src, name }: { src: string; name: string }) {
  return (
    <div className="relative w-[72px] h-[72px] rounded-md border border-atelier/30 overflow-hidden flex-shrink-0">
      <Image
        src={src}
        alt={name}
        fill
        sizes="72px"
        className="object-cover"
      />
    </div>
  );
}

export function TeamSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.from('[data-team-head] > *', {
        y: 20,
        autoAlpha: 0,
        duration: 0.6,
        stagger: 0.08,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '[data-team-head]',
          start: 'top 85%',
          once: true,
        },
      });
      gsap.from('[data-team-card]', {
        y: 28,
        autoAlpha: 0,
        duration: 0.7,
        stagger: 0.1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '[data-team-grid]',
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
      id="team"
      className="py-20 md:py-24 border-t border-gray-200 dark:border-neutral-800"
    >
      <div className="max-w-[1280px] mx-auto px-7">
        <div data-team-head className="mb-10">
          <p className="font-mono text-[11px] font-semibold tracking-[0.18em] text-atelier mb-3">
            TEAM
          </p>
          <h2
            className="font-display font-extrabold tracking-[-0.02em] leading-[1.08]"
            style={{ fontSize: 'clamp(1.8rem, 3vw, 2.5rem)' }}
          >
            Three humans. Many agents.
          </h2>
        </div>

        <div data-team-grid className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {MEMBERS.map((m) => (
            <div
              key={m.handle}
              data-team-card
              className="rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800 p-5 transition-colors hover:border-atelier/40"
            >
              <div className="flex items-start gap-4">
                <Avatar src={m.avatar} name={m.name} />
                <div className="flex flex-col min-w-0 flex-1 pt-0.5">
                  <div className="font-display font-bold text-[18px] text-black dark:text-white mb-1.5">
                    {m.name}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-gray-500 dark:text-neutral-400 mb-4">
                    {m.role}
                  </div>
                  <a
                    href={`https://twitter.com/${m.handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-mono text-[12px] text-atelier hover:text-atelier-bright transition-colors w-max"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                    @{m.handle}
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
