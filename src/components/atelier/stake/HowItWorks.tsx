'use client';

import { motion } from 'framer-motion';

const STEPS = [
  {
    title: 'Stake $ATELIER',
    body: 'Choose a lock tier and deposit your $ATELIER tokens. Locks range from 30 to 180 days -- longer locks earn higher multipliers.',
  },
  {
    title: 'Earn a weighted share of USDC revenue',
    body: 'Atelier distributes platform revenue as USDC. Your share is proportional to your weight: 30-day earns 1x, 90-day earns 4x, 180-day earns 8x your staked amount.',
  },
  {
    title: 'Claim USDC rewards anytime',
    body: 'Rewards accumulate in real time and can be claimed at any time regardless of your lock tier. Your $ATELIER principal always returns 1:1 when you unstake.',
  },
  {
    title: 'Unstake after the lock ends',
    body: 'Positions unlock automatically after the lock period -- the on-chain program enforces this. Once unlocked, you can unstake at any time.',
  },
];

export function HowItWorks() {
  return (
    <div className="space-y-4">
      <motion.h2
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.3 }}
        className="font-display font-semibold text-[13px] uppercase tracking-wider text-gray-400 dark:text-neutral-600"
      >
        How it works
      </motion.h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {STEPS.map((step, i) => (
          <motion.div
            key={step.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35, delay: i * 0.07 }}
            className="flex gap-3 rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] px-4 py-4"
          >
            <span className="font-mono text-[11px] font-bold text-atelier shrink-0 mt-px w-4">
              {i + 1}.
            </span>
            <div className="space-y-1">
              <p className="font-mono text-[12px] font-semibold text-black dark:text-white">
                {step.title}
              </p>
              <p className="font-mono text-[11px] text-gray-500 dark:text-neutral-500 leading-relaxed">
                {step.body}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.3, delay: 0.3 }}
        className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-black px-4 py-3"
      >
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          {[
            { label: '30-day lock', mult: '1x', duration: '30-day minimum' },
            { label: '90-day lock', mult: '4x', duration: '90-day minimum' },
            { label: '180-day lock', mult: '8x', duration: '180-day minimum' },
          ].map((t) => (
            <div key={t.label} className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-7 h-5 rounded bg-atelier/10 font-mono text-[10px] font-bold text-atelier">
                {t.mult}
              </span>
              <div>
                <span className="font-mono text-[11px] text-black dark:text-white">{t.label}</span>
                <span className="font-mono text-[10px] text-gray-400 dark:text-neutral-600 ml-2">
                  {t.duration}
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-600 mt-3 leading-relaxed">
          Principal returns 1:1 on unstake. Rewards are paid in USDC from real platform revenue -- not token inflation.
        </p>
      </motion.div>
    </div>
  );
}
