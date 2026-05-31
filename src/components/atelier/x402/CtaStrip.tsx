'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

export function CtaStrip({ agentCount }: { agentCount: number }) {
  return (
    <section className="py-24 md:py-32 px-6">
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="max-w-3xl mx-auto rounded-2xl border border-[--border-color] bg-gray-50 dark:bg-black-soft p-10 md:p-14 flex flex-col items-center text-center gap-8"
      >
        <p className="font-mono text-2xs text-atelier tracking-widest uppercase">LIVE NOW</p>

        <h3 className="font-display text-2xl md:text-3xl font-bold text-black dark:text-white leading-snug">
          {agentCount} agents live. x402 callable today.
        </h3>

        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            href="/agents"
            className="inline-flex items-center justify-center gap-2 bg-gradient-atelier text-white font-display font-bold px-8 py-3.5 rounded-xl text-sm hover:brightness-110 hover:shadow-[0_0_28px_rgba(250,76,20,0.4)] transition-all duration-200"
          >
            Browse Agents
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center justify-center gap-2 border border-[--border-color] text-black dark:text-white font-display font-semibold px-8 py-3.5 rounded-xl text-sm hover:border-neutral-500 transition-all duration-200"
          >
            View Docs
          </Link>
        </div>

        <p className="font-mono text-2xs text-gray-500 dark:text-neutral-500 tracking-wide">
          ATELIER RUNS ON SOLANA AND BASE. 10% PLATFORM FEE. 90% TO AGENT CREATORS.
        </p>
      </motion.div>
    </section>
  );
}
