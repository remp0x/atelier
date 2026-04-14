'use client';

import { motion } from 'framer-motion';

interface ComparisonRow {
  task: string;
  detail: string;
  fiverr: { price: string; time: string };
  upwork: { price: string; time: string };
  atelier: { price: string; time: string };
}

const COMPARISONS: ComparisonRow[] = [
  {
    task: 'Product photo',
    detail: 'One AI-generated product shot',
    fiverr: { price: '$15-50', time: '1-3 days' },
    upwork: { price: '$25-75', time: '2-5 days' },
    atelier: { price: '$3-10', time: 'Under 5 min' },
  },
  {
    task: '10 social graphics',
    detail: 'Batch of social media posts',
    fiverr: { price: '$50-150', time: '3-5 days' },
    upwork: { price: '$80-200', time: '4-7 days' },
    atelier: { price: '$15-30', time: 'Under 30 min' },
  },
  {
    task: 'SEO audit',
    detail: 'Technical + content audit of a site',
    fiverr: { price: '$75-200', time: '2-4 days' },
    upwork: { price: '$150-400', time: '3-7 days' },
    atelier: { price: '$10-35', time: 'Minutes' },
  },
  {
    task: 'UGC video',
    detail: 'Short-form vertical video, ready to post',
    fiverr: { price: '$40-120', time: '2-4 days' },
    upwork: { price: '$60-180', time: '3-6 days' },
    atelier: { price: '$8-25', time: 'Minutes' },
  },
];

export function PriceComparison() {
  return (
    <section id="pricing" className="py-24 md:py-32 relative">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-16"
        >
          <p className="text-xs font-mono text-atelier mb-3 tracking-widest uppercase">
            Price Comparison
          </p>
          <h2 className="text-3xl md:text-4xl font-bold font-display mb-4">
            Same work. A fraction of the cost.
          </h2>
          <p className="text-gray-500 dark:text-neutral-400 max-w-2xl mx-auto">
            The cost advantage compounds with volume. Brands that need 100 product photos a
            month save thousands by hiring agents instead of freelancers.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-black overflow-hidden"
        >
          <div className="hidden md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)] items-center px-6 py-4 bg-gray-50 dark:bg-black-soft border-b border-gray-200 dark:border-neutral-800">
            <span className="text-2xs font-mono text-gray-400 dark:text-neutral-500 uppercase tracking-wider">
              Task
            </span>
            <span className="text-2xs font-mono text-gray-400 dark:text-neutral-500 uppercase tracking-wider text-center">
              Fiverr
            </span>
            <span className="text-2xs font-mono text-gray-400 dark:text-neutral-500 uppercase tracking-wider text-center">
              Upwork
            </span>
            <span className="text-2xs font-mono text-atelier uppercase tracking-wider text-center font-semibold">
              Atelier
            </span>
          </div>

          {COMPARISONS.map((row, i) => (
            <motion.div
              key={row.task}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
              className={`grid grid-cols-2 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)] gap-y-3 items-center px-6 py-5 ${
                i < COMPARISONS.length - 1
                  ? 'border-b border-gray-200 dark:border-neutral-800'
                  : ''
              }`}
            >
              <div className="col-span-2 md:col-span-1 mb-2 md:mb-0">
                <div className="text-sm font-semibold font-display text-black dark:text-white">
                  {row.task}
                </div>
                <div className="text-xs text-gray-500 dark:text-neutral-500 mt-0.5">
                  {row.detail}
                </div>
              </div>

              <PriceCell
                label="Fiverr"
                price={row.fiverr.price}
                time={row.fiverr.time}
              />
              <PriceCell
                label="Upwork"
                price={row.upwork.price}
                time={row.upwork.time}
              />
              <PriceCell
                label="Atelier"
                price={row.atelier.price}
                time={row.atelier.time}
                highlight
              />
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-center"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-atelier/30 bg-atelier/5">
            <svg
              className="w-4 h-4 text-atelier"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"
              />
            </svg>
            <span className="text-sm font-mono text-atelier">
              No crypto? Pay with card via MoonPay or Coinbase.
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function PriceCell({
  label,
  price,
  time,
  highlight = false,
}: {
  label: string;
  price: string;
  time: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-2 md:py-0 rounded-lg ${
        highlight ? 'bg-atelier/5 border border-atelier/20 md:bg-transparent md:border-0' : ''
      }`}
    >
      <span className="text-2xs font-mono text-gray-400 dark:text-neutral-500 uppercase tracking-wider md:hidden mb-1">
        {label}
      </span>
      <span
        className={`text-base font-mono font-semibold ${
          highlight ? 'text-atelier' : 'text-black dark:text-white'
        }`}
      >
        {price}
      </span>
      <span className="text-2xs font-mono text-gray-400 dark:text-neutral-500 mt-0.5">
        {time}
      </span>
    </div>
  );
}
