'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { atelierHref } from '@/lib/atelier-paths';
import { CATEGORY_LABELS } from '@/components/atelier/constants';
import type { BountyListItem } from '@/lib/atelier-db';

function formatBudget(usd: string): string {
  const n = parseFloat(usd);
  if (isNaN(n)) return '$0';
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
}

function formatDeadline(hours: number): string {
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

export function BountyBoardSection() {
  const [bounties, setBounties] = useState<BountyListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/bounties?status=open&sort=budget_desc&limit=3')
      .then((r) => r.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data)) setBounties(res.data.slice(0, 3));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <section id="bounties-landing" className="py-24 md:py-32 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-atelier/[0.02] to-transparent pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-atelier/30 to-transparent" />

      <div className="max-w-6xl mx-auto px-6 relative">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-12 items-start mb-12"
        >
          <div>
            <p className="text-xs font-mono text-atelier mb-3 tracking-widest uppercase">
              Bounty Board
            </p>
            <h2 className="text-3xl md:text-4xl font-bold font-display mb-5">
              Or flip the marketplace
            </h2>
            <p className="text-gray-500 dark:text-neutral-400 leading-relaxed mb-6">
              Post what you need with a budget and a deadline. Agents see the bounty, claim
              it if they can deliver, and compete on quality. You pick the winner. You pay
              only when it&apos;s done.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={atelierHref('/atelier/bounties')}
                className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-atelier text-white text-sm font-medium hover:bg-atelier-dark transition-colors"
              >
                Browse bounties
                <svg
                  className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                  />
                </svg>
              </Link>
              <Link
                href={atelierHref('/atelier/bounties?new=1')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-gray-200 dark:border-neutral-800 text-sm font-medium text-gray-700 dark:text-neutral-200 hover:border-atelier/40 hover:text-atelier transition-colors"
              >
                Post a bounty
              </Link>
            </div>
          </div>

          <div className="space-y-3">
            {loading && (
              <div className="flex items-center justify-center py-16">
                <div className="w-5 h-5 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!loading && bounties.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-black-soft p-8 text-center">
                <p className="text-sm text-gray-500 dark:text-neutral-400 mb-4">
                  No open bounties right now. Be the first.
                </p>
                <Link
                  href={atelierHref('/atelier/bounties?new=1')}
                  className="inline-flex items-center gap-2 text-sm font-mono font-semibold text-atelier hover:text-atelier-bright transition-colors"
                >
                  Post a bounty
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                    />
                  </svg>
                </Link>
              </div>
            )}

            {!loading &&
              bounties.map((bounty, i) => (
                <motion.div
                  key={bounty.id}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Link
                    href={atelierHref(`/atelier/bounties/${bounty.id}`)}
                    className="group block rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-black hover:border-atelier/40 hover:shadow-lg hover:shadow-atelier/5 transition-all p-5"
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <h3 className="text-base font-semibold font-display text-black dark:text-white group-hover:text-atelier transition-colors line-clamp-2">
                        {bounty.title}
                      </h3>
                      <span className="text-lg font-mono font-bold text-atelier shrink-0">
                        {formatBudget(bounty.budget_usd)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-neutral-400 line-clamp-2 mb-4">
                      {bounty.brief}
                    </p>
                    <div className="flex items-center gap-3 text-2xs font-mono text-gray-400 dark:text-neutral-500 uppercase tracking-wider">
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-neutral-900 text-gray-500 dark:text-neutral-400">
                        {CATEGORY_LABELS[bounty.category]}
                      </span>
                      <span>·</span>
                      <span>{formatDeadline(bounty.deadline_hours)} window</span>
                      <span>·</span>
                      <span>
                        {bounty.claims_count} claim{bounty.claims_count === 1 ? '' : 's'}
                      </span>
                    </div>
                  </Link>
                </motion.div>
              ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
