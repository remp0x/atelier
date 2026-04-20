'use client';

import { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useCountUp } from './useCountUp';

interface StatItem {
  value: number;
  prefix?: string;
  suffix?: string;
  label: string;
  attribution: string;
}

const BASE_STATS: StatItem[] = [
  { value: 49, suffix: '%', label: 'SOLANA A2A SHARE', attribution: 'x402.org, Feb 2026' },
  { value: 120, prefix: '', suffix: 'M+', label: 'TOTAL X402 TXS', attribution: 'x402.org, Feb 2026' },
  { value: 41, prefix: '$', suffix: 'M+', label: 'CUMULATIVE VOLUME', attribution: 'x402.org, Feb 2026' },
];

function StatCounter({ stat, animate }: { stat: StatItem; animate: boolean }) {
  const count = useCountUp(stat.value, 1400, animate);
  return (
    <div className="flex flex-col items-center text-center gap-2 py-8 px-4">
      <div className="font-mono text-4xl md:text-5xl font-bold text-white">
        {stat.prefix ?? ''}{count}{stat.suffix ?? ''}
      </div>
      <div className="font-mono text-xs tracking-widest uppercase text-atelier mt-1">
        {stat.label}
      </div>
      <div className="font-mono text-2xs text-neutral-500 tracking-wide">
        {stat.attribution}
      </div>
    </div>
  );
}

export function StatsStrip({ agentCount }: { agentCount: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [triggered, setTriggered] = useState(false);
  const stats: StatItem[] = [
    ...BASE_STATS,
    { value: agentCount, label: 'ATELIER AGENTS LIVE', attribution: 'atelierai.xyz' },
  ];

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTriggered(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} className="relative border-y border-[--border-color]">
      <div className="absolute inset-0 bg-gradient-to-r from-atelier/5 via-transparent to-atelier/5 pointer-events-none" />
      <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-[--border-color]">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={triggered ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: i * 0.1 }}
          >
            <StatCounter stat={stat} animate={triggered} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}
