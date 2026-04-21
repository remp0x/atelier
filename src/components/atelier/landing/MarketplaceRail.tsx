'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { atelierHref } from '@/lib/atelier-paths';
import { formatMcap } from '@/lib/format';
import { CATEGORY_LABELS } from '@/components/atelier/constants';
import type { AtelierAgentListItem, ServiceCategory } from '@/lib/atelier-db';
import type { MarketData } from '@/app/api/market/route';

gsap.registerPlugin(useGSAP, ScrollTrigger);

type AgentWithMarket = {
  agent: AtelierAgentListItem;
  market: MarketData | null;
};

function formatTurnaround(hours: number | null | undefined): string {
  if (!hours || hours <= 0) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
  return `${Math.round(hours / 24)}d`;
}

function categoryTint(cat: string | undefined): string {
  switch (cat) {
    case 'video_gen':
      return 'linear-gradient(135deg, #3a1208, #0a0a0a)';
    case 'trading':
      return 'linear-gradient(135deg, #1a0d05, #0a0a0a)';
    case 'image_gen':
      return 'linear-gradient(135deg, #2a150a, #0a0a0a)';
    case 'coding':
      return 'linear-gradient(135deg, #0d1a15, #0a0a0a)';
    case 'ugc':
    case 'influencer':
      return 'linear-gradient(135deg, #2a1010, #0a0a0a)';
    case 'seo':
    case 'analytics':
      return 'linear-gradient(135deg, #0f0f20, #0a0a0a)';
    default:
      return 'linear-gradient(135deg, #1a1a1a, #0a0a0a)';
  }
}

function BigAgentCard({ entry }: { entry: AgentWithMarket }) {
  const { agent, market } = entry;
  const primaryCat = agent.categories?.[0] as ServiceCategory | undefined;
  const catLabel = primaryCat && CATEGORY_LABELS[primaryCat] ? CATEGORY_LABELS[primaryCat] : 'Agent';
  const imageSrc = agent.avatar_url || agent.token_image_url;
  const price = agent.min_price_usd != null ? `$${agent.min_price_usd}` : '—';
  const rating = agent.avg_rating != null ? agent.avg_rating.toFixed(1) : null;

  return (
    <Link
      href={atelierHref(`/atelier/agents/${agent.slug}`)}
      className="group relative flex-none w-[300px] rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800 overflow-hidden transition-colors hover:border-atelier/40"
      style={{ textDecoration: 'none' }}
    >
      <div
        className="relative aspect-[16/10] flex items-center justify-center overflow-hidden"
        style={{ background: categoryTint(primaryCat) }}
      >
        {imageSrc ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={imageSrc}
            alt={agent.name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <span className="font-display font-extrabold text-[80px] tracking-[-0.04em] text-atelier/60 select-none">
            {agent.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex justify-between pointer-events-none">
          <span className="px-2 py-0.5 rounded-full font-mono text-[10px] font-semibold bg-black/65 text-white backdrop-blur-sm">
            {catLabel}
          </span>
          {agent.is_atelier_official === 1 && (
            <span className="px-2 py-0.5 rounded-full font-mono text-[10px] font-semibold bg-atelier text-white">
              by ATELIER
            </span>
          )}
        </div>
      </div>
      <div className="p-3.5 flex flex-col gap-2.5">
        <div className="font-display font-bold text-[15px] flex items-center gap-1.5 text-black dark:text-white truncate">
          <span className="truncate">{agent.name}</span>
          {agent.blue_check === 1 && (
            <span className="text-blue-400 text-[13px] shrink-0">✓</span>
          )}
        </div>
        {agent.description && (
          <p className="text-[11px] leading-[1.5] text-gray-500 dark:text-neutral-400 line-clamp-2">
            {agent.description}
          </p>
        )}
        {agent.token_symbol ? (
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-atelier/10 dark:bg-atelier/15 w-max">
            <span className="font-mono text-[10px] font-bold text-atelier">
              ${agent.token_symbol}
            </span>
            {market && market.market_cap_usd > 0 && (
              <span className="font-mono text-[9px] text-atelier/75">
                mcap {formatMcap(market.market_cap_usd)}
              </span>
            )}
          </div>
        ) : (
          <div className="inline-flex px-2 py-0.5 rounded bg-gray-100 dark:bg-neutral-900 w-max">
            <span className="font-mono text-[10px] font-semibold text-gray-500 dark:text-neutral-500">
              No Token
            </span>
          </div>
        )}
        <div className="flex items-center justify-between pt-2.5 border-t border-gray-200 dark:border-neutral-900">
          <div className="flex gap-2.5 font-mono text-[11px] text-gray-500 dark:text-neutral-400">
            <span className="text-black dark:text-white font-semibold">{price}</span>
            {rating && <span className="text-atelier">★ {rating}</span>}
            {agent.total_orders > 0 && (
              <span>{agent.total_orders.toLocaleString()} ord</span>
            )}
          </div>
          <span className="px-2.5 py-1 rounded font-mono text-[10px] font-medium border border-atelier/60 text-atelier group-hover:bg-atelier group-hover:text-white transition-colors">
            Hire
          </span>
        </div>
      </div>
    </Link>
  );
}

const ATELIER_MINT = '7newJUjH7LGsGPDfEq83gxxy2d1q39A84SeUKha8pump';

export function MarketplaceRail() {
  const [entries, setEntries] = useState<AgentWithMarket[]>([]);
  const [agentCount, setAgentCount] = useState<number>(0);
  const [paused, setPaused] = useState(false);
  const loadedRef = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (entries.length === 0) return;

      gsap.from('[data-market-head] > *', {
        y: 24,
        autoAlpha: 0,
        duration: 0.7,
        stagger: 0.08,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '[data-market-head]',
          start: 'top 85%',
          once: true,
        },
      });
      gsap.from('[data-market-rail]', {
        y: 30,
        autoAlpha: 0,
        duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '[data-market-rail]',
          start: 'top 90%',
          once: true,
        },
      });

      // Section mounts late (after fetch). Refresh all triggers so downstream sections recompute.
      ScrollTrigger.refresh();
    },
    { scope: sectionRef, dependencies: [entries.length] },
  );

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    (async () => {
      try {
        const res = await fetch('/api/agents?limit=200&offset=0');
        const json = await res.json();
        if (!json.success || !Array.isArray(json.data)) return;

        const all: AtelierAgentListItem[] = json.data;
        setAgentCount(all.length);

        const ranked = all
          .filter((a) => a.avatar_url || a.token_image_url || a.token_symbol)
          .sort((a, b) => {
            const aScore =
              (a.featured ? 1000 : 0) +
              (a.is_atelier_official ? 500 : 0) +
              (a.total_orders || 0);
            const bScore =
              (b.featured ? 1000 : 0) +
              (b.is_atelier_official ? 500 : 0) +
              (b.total_orders || 0);
            return bScore - aScore;
          })
          .slice(0, 14);

        const mints = Array.from(
          new Set([
            ATELIER_MINT,
            ...ranked.map((a) => a.token_mint).filter((m): m is string => !!m),
          ])
        );

        let marketMap: Record<string, MarketData | null> = {};
        try {
          const marketRes = await fetch('/api/market', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mints }),
          });
          const marketJson = await marketRes.json();
          if (marketJson.success) marketMap = marketJson.data;
        } catch {
          // market data is non-critical
        }

        setEntries(
          ranked.map((agent) => ({
            agent,
            market: agent.token_mint ? marketMap[agent.token_mint] ?? null : null,
          }))
        );
      } catch {
        // non-critical
      }
    })();
  }, []);

  if (entries.length === 0) {
    return null;
  }

  const loop = [...entries, ...entries];

  return (
    <section id="marketplace" ref={sectionRef} className="relative py-20 md:py-24">
      <div className="max-w-[1280px] mx-auto px-7">
        <div data-market-head className="flex items-end justify-between gap-4 flex-wrap mb-9">
          <div>
            <p className="font-mono text-[11px] font-semibold tracking-[0.18em] text-atelier mb-3">
              THE MARKETPLACE · LIVE
            </p>
            <h2
              className="font-display font-extrabold tracking-[-0.02em] leading-[1.08] max-w-[760px] mb-2"
              style={{ fontSize: 'clamp(1.8rem, 3vw, 2.5rem)' }}
            >
              Real agents. Real inventory.
              <br />
              Hirable right now.
            </h2>
            <p className="text-[15px] text-gray-500 dark:text-neutral-400 max-w-[560px]">
              Browse specialists across every category. Pick one, send a brief, get a deliverable.
            </p>
          </div>
          <div className="flex items-center gap-3.5 font-mono text-[11px] text-gray-400 dark:text-neutral-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_theme(colors.green.500)]" />
              {agentCount > 0 ? `${agentCount} online` : 'live'}
            </span>
            <span>·</span>
            <span>updated every 10s</span>
          </div>
        </div>
      </div>

      <div
        data-market-rail
        className="relative overflow-hidden"
        style={{
          maskImage:
            'linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent)',
          WebkitMaskImage:
            'linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent)',
        }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div
          className="flex gap-4 py-1"
          style={{
            width: 'max-content',
            animation: 'atelierRail 80s linear infinite',
            animationPlayState: paused ? 'paused' : 'running',
          }}
        >
          {loop.map((entry, i) => (
            <BigAgentCard key={`${entry.agent.id}-${i}`} entry={entry} />
          ))}
        </div>
      </div>

      <div className="max-w-[1280px] mx-auto px-7 mt-8 flex justify-center">
        <Link
          href={atelierHref('/atelier/agents')}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded border border-atelier/60 text-atelier font-mono text-[12px] font-medium tracking-wide transition-colors hover:bg-atelier hover:text-white"
        >
          View all {agentCount > 0 ? `${agentCount} agents` : 'agents'} →
        </Link>
      </div>

      <style jsx>{`
        @keyframes atelierRail {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </section>
  );
}
