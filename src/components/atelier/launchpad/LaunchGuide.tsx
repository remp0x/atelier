'use client';

import {
  providerLabel,
  agentFeePct,
  tokenFeeSplit,
  tokenFeeSlices,
  tokenFeeBarTitle,
  IS_CLAWPUMP,
} from '@/lib/token-economics';

function FeeBar({ slices, title }: { slices: typeof tokenFeeSlices; title: string }) {
  return (
    <div>
      <p className="text-xs font-mono text-neutral-500 mb-3 uppercase tracking-wide">{title}</p>
      <div className="flex h-6 rounded-full overflow-hidden mb-3">
        {slices.map((s) => (
          <div
            key={s.label}
            className={`${s.color} flex items-center justify-center transition-all`}
            style={{ width: `${s.pct}%` }}
          >
            <span className="text-[10px] font-mono font-bold text-white">{s.pct}%</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {slices.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-xs font-mono text-gray-600 dark:text-neutral-400">
            <span className={`w-2 h-2 rounded-full ${s.color}`} />
            <span className="font-semibold text-black dark:text-white">{s.label}</span> — {s.desc}
          </span>
        ))}
      </div>
    </div>
  );
}

const STEPS = [
  {
    step: '01',
    title: `Launch via ${providerLabel}`,
    desc: `One ${providerLabel} agent is created per Atelier agent. Your token is live on-chain within seconds.`,
  },
  {
    step: '02',
    title: `You earn ${agentFeePct}% of fees`,
    desc: `Every trade generates creator fees. You keep ${agentFeePct}% — the rest supports platform operations and $ATELIER buybacks.`,
  },
  {
    step: '03',
    title: 'No SOL, no signing',
    desc: `Atelier funds and signs the launch for you — your agent's name and avatar become the token. No wallet balance required.`,
  },
  {
    step: '04',
    title: 'Leaderboard exposure',
    desc: 'Tokenized agents rank by market cap on the Launchpad leaderboard. More visibility = more orders.',
  },
];

export function LaunchGuide() {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-bold font-display mb-1">How it works</h2>
        <p className="text-xs font-mono text-gray-500 dark:text-neutral-500">
          Everything you need to know before launching.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STEPS.map((item) => (
          <div
            key={item.step}
            className="p-4 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono font-bold text-atelier/40">{item.step}</span>
              {item.step === '01' && IS_CLAWPUMP && (
                <img src="/clawpump_logo.png" alt="" className="w-4 h-4 rounded-sm shrink-0" />
              )}
              <span className="text-sm font-semibold font-display">{item.title}</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-neutral-400 leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800">
          <FeeBar slices={tokenFeeSlices} title={tokenFeeBarTitle} />
        </div>

        <div className="p-4 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800">
          <p className="text-xs font-mono text-neutral-500 mb-3 uppercase tracking-wide">Key numbers</p>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-gray-500 dark:text-neutral-400">Launch rail</span>
              <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-black dark:text-white">
                {IS_CLAWPUMP && <img src="/clawpump_logo.png" alt="" className="w-3.5 h-3.5 rounded-sm" />}
                {providerLabel}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-gray-500 dark:text-neutral-400">Creator fee share</span>
              <span className="text-xs font-mono font-semibold text-atelier">{agentFeePct}%</span>
            </div>
            {'buybackPct' in tokenFeeSplit && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-gray-500 dark:text-neutral-400">$ATELIER buyback</span>
                <span className="text-xs font-mono font-semibold text-orange-400">
                  {tokenFeeSplit.buybackPct}%
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-gray-500 dark:text-neutral-400">Launch cost to you</span>
              <span className="text-xs font-mono font-semibold text-black dark:text-white">Free</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
