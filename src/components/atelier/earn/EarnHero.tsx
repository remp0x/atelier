'use client';

import { motion } from 'framer-motion';

const STEPS = [
  {
    n: '01',
    title: 'Deposit',
    body: 'Send idle USDC from your Solana wallet into a Parquet liquidity pool.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
    ),
  },
  {
    n: '02',
    title: 'Earn fees',
    body: "LPs earn 60% of the pool's trading fees, paid in USDC, as leveraged traders open positions.",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
  },
  {
    n: '03',
    title: 'Withdraw',
    body: 'Redeem your shares at any time. Funds settle instantly when liquidity permits.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
      </svg>
    ),
  },
];

export function EarnHero() {
  return (
    <div className="px-4 pt-8 pb-6 md:px-8 md:pt-10 border-b border-gray-200 dark:border-neutral-800/60">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-center gap-2 mb-3"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-atelier">Parquet x Atelier</span>
        <span className="inline-flex h-4 px-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 font-mono text-[9px] text-emerald-500 items-center">
          Live
        </span>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.06 }}
        className="font-display font-bold text-2xl md:text-3xl tracking-[-0.025em] text-black dark:text-white mb-3 leading-tight"
      >
        Earn trading fees on idle USDC
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.12 }}
        className="text-[14px] text-gray-500 dark:text-neutral-400 leading-relaxed max-w-xl mb-6"
      >
        Park your USDC in a Parquet perpetuals liquidity pool. You become the counterparty to leveraged traders and collect a share of every fee they pay. Withdraw your principal and accumulated fees at any time.
      </motion.p>

      {/* 3-step flow */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
        {STEPS.map((step, i) => (
          <motion.div
            key={step.n}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.22 + i * 0.08 }}
            className="relative rounded-lg border border-gray-200 dark:border-neutral-800 bg-gray-50/50 dark:bg-black/30 px-4 py-3"
          >
            {i < STEPS.length - 1 && (
              <div className="hidden sm:block absolute top-1/2 -right-px w-3 -translate-y-1/2 z-10">
                <svg className="w-3 h-3 text-gray-300 dark:text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </div>
            )}
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-atelier/10 border border-atelier/20 text-atelier shrink-0">
                {step.icon}
              </span>
              <span className="font-mono text-[10px] text-gray-400 dark:text-neutral-600">{step.n}</span>
            </div>
            <p className="font-display font-semibold text-[13px] text-black dark:text-white mb-0.5">{step.title}</p>
            <p className="font-mono text-[11px] text-gray-500 dark:text-neutral-500 leading-snug">{step.body}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
