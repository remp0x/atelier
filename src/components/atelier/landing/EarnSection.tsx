'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { appUrl } from '@/lib/routing';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import {
  categoryConstituents,
  formatAprPct,
  microToUsd,
  compactUsd,
} from '@/components/atelier/earn/types';

gsap.registerPlugin(useGSAP, ScrollTrigger);

// --- API types ---

interface EarnApiProduct {
  id: string;
  kind: 'lending' | 'liquidity_provision';
  label: string;
  risk: 'lower' | 'higher';
  apr_label: string;
  headline_apr_pct: number | null;
  total_tvl_micro: string;
  markets: Array<Record<string, unknown>>;
}

interface EarnApiResponse {
  success: boolean;
  data?: {
    enabled: string[];
    markets: Array<{
      market: string;
      venue: string;
      key: string;
      fee_apr_pct: number | null;
      total_usdc_micro: string;
    }>;
    products: EarnApiProduct[];
  };
}

// --- Static strategy catalog (lower risk first) ---

type StrategyKind = 'lending' | 'liquidity_provision' | 'agent_trading';

interface StaticStrategy {
  kind: StrategyKind;
  label: string;
  risk: 'lower' | 'higher';
  apr_label: string;
  pitch: string;
}

const STRATEGIES: StaticStrategy[] = [
  {
    kind: 'lending',
    label: 'Lending',
    risk: 'lower',
    apr_label: 'Supply APY',
    pitch:
      'Supply USDC to money markets (Solend, Kamino, Meteora) and earn interest as borrowers pay. Steadier yield, lower volatility.',
  },
  {
    kind: 'liquidity_provision',
    label: 'Liquidity Provision',
    risk: 'higher',
    apr_label: 'Fee APR',
    pitch:
      'Provide liquidity to Parquet perpetuals pools -- US equities and crypto perps -- and collect a share of every trading fee.',
  },
  {
    kind: 'agent_trading',
    label: 'Autonomous Trading',
    risk: 'higher',
    apr_label: 'Autonomous',
    pitch:
      "Let your agent trade DeFi autonomously -- swaps, snipes and arbitrage across DEXes, 24/7. You set the strategy and risk; it executes.",
  },
];

// --- Icons ---

const STRATEGY_ICON: Record<StrategyKind, React.ReactNode> = {
  lending: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
    </svg>
  ),
  liquidity_provision: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
    </svg>
  ),
  agent_trading: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 8.5A1.5 1.5 0 018.5 7h7A1.5 1.5 0 0117 8.5v7a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 017 15.5v-7z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 4v3M12 4v3M15 4v3M9 17v3M12 17v3M15 17v3M4 9h3M4 12h3M4 15h3M17 9h3M17 12h3M17 15h3" />
    </svg>
  ),
};

// --- Sub-components ---

function RiskBadge({ risk }: { risk: 'lower' | 'higher' }) {
  if (risk === 'lower') {
    return (
      <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 font-mono text-[9px] text-emerald-600 dark:text-emerald-400 shrink-0">
        <span className="w-1 h-1 rounded-full bg-emerald-500 shrink-0" />
        Lower risk
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-amber-500/10 border border-amber-500/20 font-mono text-[9px] text-amber-600 dark:text-amber-400 shrink-0">
      <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" />
      Higher risk
    </span>
  );
}

function StrategyCard({
  strategy,
  liveProduct,
  enabledCategories,
  loaded,
}: {
  strategy: StaticStrategy;
  liveProduct: EarnApiProduct | null;
  enabledCategories: string[];
  loaded: boolean;
}) {
  const isAutoTrading = strategy.kind === 'agent_trading';

  const aprDisplay: string = (() => {
    if (isAutoTrading) return '';
    if (!loaded) return '—';
    if (!liveProduct) return 'Variable';
    return liveProduct.headline_apr_pct !== null
      ? formatAprPct(liveProduct.headline_apr_pct)
      : 'Variable';
  })();

  const aprPositive =
    !isAutoTrading &&
    liveProduct?.headline_apr_pct != null &&
    liveProduct.headline_apr_pct > 0;

  const marketCount = liveProduct?.markets.length ?? null;
  const tvlUsd = liveProduct ? microToUsd(liveProduct.total_tvl_micro) : null;

  // Drive tickers from enabled categories. Default both before API responds.
  const activeEnabled = loaded ? enabledCategories : ['equity-us', 'crypto-usd'];
  const cryptoTickers = activeEnabled.includes('crypto-usd')
    ? categoryConstituents('crypto-usd')
    : [];
  const equityTickers = activeEnabled.includes('equity-us')
    ? categoryConstituents('equity-us')
    : [];
  const equitySample = equityTickers.slice(0, 5);
  const equityRemainder = equityTickers.length - equitySample.length;

  return (
    <div
      className={`rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] overflow-hidden transition-colors duration-200 ${
        isAutoTrading ? 'opacity-60' : 'hover:border-atelier/30'
      }`}
    >
      <div className="px-4 pt-4 pb-4">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-atelier/10 border border-atelier/20 text-atelier shrink-0">
              {STRATEGY_ICON[strategy.kind]}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-display font-bold text-[15px] text-black dark:text-white leading-tight tracking-[-0.01em]">
                {strategy.label}
              </span>
              <RiskBadge risk={strategy.risk} />
            </div>
          </div>

          {isAutoTrading ? (
            <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-gray-100 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 font-mono text-[10px] text-gray-500 dark:text-neutral-400 shrink-0">
              Coming soon
            </span>
          ) : (
            <div className="text-right shrink-0">
              <p
                className={`font-mono text-[18px] font-semibold tabular-nums leading-none ${
                  aprPositive
                    ? 'text-emerald-500 dark:text-emerald-400'
                    : 'text-gray-400 dark:text-neutral-500'
                }`}
              >
                {aprDisplay}
              </p>
              <p className="font-mono text-[9px] text-gray-400 dark:text-neutral-600 mt-0.5">
                {strategy.apr_label}
              </p>
            </div>
          )}
        </div>

        {/* Pitch */}
        <p className="text-[12px] text-gray-500 dark:text-neutral-400 leading-[1.5] mb-3">
          {strategy.pitch}
        </p>

        {/* Footer */}
        {strategy.kind === 'liquidity_provision' && (
          <div className="space-y-2">
            {cryptoTickers.length > 0 && (
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-gray-500 dark:text-neutral-500 mb-1">
                  Crypto
                </p>
                <div className="flex flex-wrap gap-1">
                  {cryptoTickers.map(({ ticker }) => (
                    <span
                      key={ticker}
                      className="font-mono text-[11px] font-semibold text-atelier border border-atelier/30 rounded px-1.5 py-0.5 bg-atelier/5"
                    >
                      {ticker}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {equityTickers.length > 0 && (
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-gray-500 dark:text-neutral-500 mb-1">
                  US Equities
                </p>
                <div className="flex flex-wrap gap-1">
                  {equitySample.map(({ ticker }) => (
                    <span
                      key={ticker}
                      className="font-mono text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 border border-gray-200 dark:border-neutral-700 rounded px-1.5 py-0.5 bg-white/70 dark:bg-neutral-900/60"
                    >
                      {ticker}
                    </span>
                  ))}
                  {equityRemainder > 0 && (
                    <span className="font-mono text-[11px] text-gray-500 dark:text-neutral-500 border border-gray-200 dark:border-neutral-800 rounded px-1.5 py-0.5 bg-white/50 dark:bg-neutral-900/30">
                      +{equityRemainder} more
                    </span>
                  )}
                </div>
              </div>
            )}
            {loaded && marketCount !== null && (
              <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-600 tabular-nums">
                {marketCount} market{marketCount === 1 ? '' : 's'}
                {tvlUsd !== null && tvlUsd > 0 ? <> &middot; {compactUsd(tvlUsd)} pooled</> : null}
              </p>
            )}
          </div>
        )}

        {strategy.kind === 'lending' && (
          <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-600 tabular-nums">
            {loaded && marketCount !== null ? (
              <>
                {marketCount} market{marketCount === 1 ? '' : 's'}
                {tvlUsd !== null && tvlUsd > 0 ? <> &middot; {compactUsd(tvlUsd)} pooled</> : null}
              </>
            ) : (
              <>Solend &middot; Kamino &middot; Meteora</>
            )}
          </p>
        )}

        {strategy.kind === 'agent_trading' && (
          <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-600">
            Coming soon &middot; agent-run, no manual trading
          </p>
        )}

      </div>
    </div>
  );
}

// --- Main section ---

export function EarnSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const visualRef = useRef<HTMLDivElement>(null);

  const [liveProducts, setLiveProducts] = useState<EarnApiProduct[]>([]);
  const [enabledCategories, setEnabledCategories] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/earn/parquet/markets')
      .then((r) => r.json())
      .then((res: EarnApiResponse) => {
        if (res.success && res.data) {
          setLiveProducts(res.data.products);
          setEnabledCategories(res.data.enabled);
        }
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });
  }, []);

  useGSAP(
    () => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      gsap.from('[data-earn-copy] > *', {
        y: 24,
        duration: 0.7,
        stagger: 0.08,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '[data-earn-copy]',
          start: 'top 82%',
          once: true,
        },
      });

      gsap.from('[data-earn-visual]', {
        y: 40,
        duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '[data-earn-visual]',
          start: 'top 80%',
          once: true,
        },
      });

      gsap.from('[data-earn-card]', {
        y: 20,
        autoAlpha: 0,
        duration: 0.6,
        stagger: 0.12,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '[data-earn-visual]',
          start: 'top 78%',
          once: true,
        },
      });

      if (!reduced && visualRef.current && sectionRef.current) {
        gsap.fromTo(
          visualRef.current,
          { yPercent: 6 },
          {
            yPercent: -6,
            ease: 'none',
            scrollTrigger: {
              trigger: sectionRef.current,
              start: 'top bottom',
              end: 'bottom top',
              scrub: 1.2,
            },
          },
        );
      }
    },
    { scope: sectionRef },
  );

  return (
    <section
      id="earn"
      ref={sectionRef}
      className="relative py-20 md:py-24 overflow-hidden"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(250,76,20,0.10), transparent 65%)',
        }}
      />

      <div className="relative max-w-[1280px] mx-auto px-7">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-10 lg:gap-14 items-center">

          {/* Left: copy */}
          <div data-earn-copy>
            <p className="font-mono text-[11px] font-semibold tracking-[0.18em] text-atelier mb-3 flex items-center gap-2">
              ATELIER EARN
              <span className="inline-flex items-center h-4 px-1.5 rounded border border-atelier/40 bg-atelier/5 font-mono text-[9px] font-semibold tracking-[0.14em] text-atelier">
                LIVE
              </span>
            </p>

            <h2
              className="font-display font-extrabold tracking-[-0.02em] leading-[1.08] mb-4"
              style={{ fontSize: 'clamp(1.8rem, 3vw, 2.5rem)' }}
            >
              3 ways your idle USDC
              <br />
              earns on Solana.
            </h2>

            <p className="text-[15px] leading-[1.6] text-gray-600 dark:text-neutral-300 max-w-[480px] mb-6">
              Deposit from your Atelier wallet into a lending market or a Parquet liquidity pool --
              US equities and crypto perps both available. Or let your agent trade
              autonomously. Withdraw anytime, no fees.
            </p>

            <ul className="flex flex-col gap-3 mb-7">
              <li className="flex items-center gap-2 font-mono text-[11px] text-gray-500 dark:text-neutral-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                No lock-up, no withdrawal fee
              </li>
              <li className="flex items-center gap-2 font-mono text-[11px] text-gray-500 dark:text-neutral-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                Yield from real on-chain activity
              </li>
              <li className="flex items-center gap-2 font-mono text-[11px] text-gray-500 dark:text-neutral-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                24/7 on Solana -- deposit in seconds
              </li>
            </ul>

            <Link
              href={appUrl('/earn')}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded bg-atelier text-white font-mono text-[12px] font-medium tracking-wide cursor-pointer transition-all duration-150 hover:bg-atelier-bright hover:shadow-[0_0_20px_rgba(250,76,20,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              Explore Earn &#8594;
            </Link>
          </div>

          {/* Right: 3 strategy cards */}
          <div data-earn-visual ref={visualRef} className="relative will-change-transform">
            <div
              className="absolute inset-0 pointer-events-none rounded-xl"
              style={{
                background:
                  'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(250,76,20,0.07), transparent 70%)',
              }}
            />
            <div className="relative space-y-3">
              {STRATEGIES.map((strategy) => {
                const liveProduct =
                  strategy.kind !== 'agent_trading'
                    ? (liveProducts.find((p) => p.kind === strategy.kind) ?? null)
                    : null;
                return (
                  <div key={strategy.kind} data-earn-card>
                    <StrategyCard
                      strategy={strategy}
                      liveProduct={liveProduct}
                      enabledCategories={enabledCategories}
                      loaded={loaded}
                    />
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
