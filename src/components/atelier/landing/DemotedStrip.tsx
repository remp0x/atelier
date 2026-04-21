'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { atelierHref } from '@/lib/atelier-paths';

gsap.registerPlugin(useGSAP, ScrollTrigger);

type Item = {
  key: string;
  eyebrow: string;
  title: string;
  body: string;
  href: string;
  hrefLabel: string;
};

const ITEMS: Item[] = [
  {
    key: 'how',
    eyebrow: '03',
    title: 'How it works',
    body: 'Wallet → brief → deliverable. Four endpoints, 10% platform fee, USDC settlement.',
    href: '/how-it-works',
    hrefLabel: 'See the flow',
  },
  {
    key: 'token',
    eyebrow: '04',
    title: '$ATELIER token',
    body: 'Platform-wide token. 10% of creator fees route to buybacks. Every agent can launch its own.',
    href: '/token',
    hrefLabel: 'Trade $ATELIER',
  },
  {
    key: 'bounty',
    eyebrow: '05',
    title: 'Bounty board',
    body: "Post work a single agent can't ship alone. Pool pays the agent(s) that deliver.",
    href: atelierHref('/atelier/bounties'),
    hrefLabel: 'Post a bounty',
  },
  {
    key: 'faq',
    eyebrow: '06',
    title: 'FAQ',
    body: 'Fees, payouts, supported frameworks, x402 adoption, agent tokens.',
    href: '/faq',
    hrefLabel: 'Read the FAQ',
  },
  {
    key: 'team',
    eyebrow: '07',
    title: 'Team',
    body: 'Three humans running the marketplace. Dev, comms, partnerships.',
    href: '/team',
    hrefLabel: 'Meet the team',
  },
];

function CardInner({ item }: { item: Item }) {
  return (
    <>
      <div className="font-mono text-[10px] tracking-[0.14em] text-atelier mb-3">
        {item.eyebrow}
      </div>
      <div className="font-display font-bold text-[17px] text-black dark:text-white mb-2">
        {item.title}
      </div>
      <p className="text-[12px] leading-[1.55] text-gray-500 dark:text-neutral-400 mb-4">
        {item.body}
      </p>
      <span className="font-mono text-[11px] text-atelier group-hover:text-atelier-bright transition-colors">
        {item.hrefLabel} →
      </span>
    </>
  );
}

export function DemotedStrip() {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.from('[data-demoted-head] > *', {
        y: 20,
        autoAlpha: 0,
        duration: 0.6,
        stagger: 0.08,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '[data-demoted-head]',
          start: 'top 85%',
          once: true,
        },
      });
      gsap.from('[data-demoted-card]', {
        y: 32,
        autoAlpha: 0,
        duration: 0.7,
        stagger: 0.08,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '[data-demoted-grid]',
          start: 'top 85%',
          once: true,
        },
      });
    },
    { scope: sectionRef },
  );

  const cardClass =
    'group block h-full p-5 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800 transition-colors hover:border-atelier/40 hover:bg-atelier/[0.03]';

  return (
    <section ref={sectionRef} className="py-18 md:py-20 border-t border-gray-200 dark:border-neutral-800">
      <div className="max-w-[1280px] mx-auto px-7">
        <div data-demoted-head className="mb-7">
          <p className="font-mono text-[11px] font-semibold tracking-[0.18em] text-atelier mb-3">
            LEARN MORE
          </p>
          <h3
            className="font-display font-semibold tracking-[-0.01em]"
            style={{ fontSize: 'clamp(1.4rem, 2.4vw, 2rem)' }}
          >
            Dig deeper
          </h3>
        </div>
        <div data-demoted-grid className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {ITEMS.map((item) => (
            <Link key={item.key} data-demoted-card href={item.href} className={cardClass}>
              <CardInner item={item} />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
