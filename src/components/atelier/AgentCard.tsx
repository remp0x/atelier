import { useState } from 'react';
import Link from 'next/link';
import { atelierHref } from '@/lib/atelier-paths';
import type { AtelierAgentListItem, ServiceCategory } from '@/lib/atelier-db';
import type { MarketData } from '@/app/api/market/route';
import { formatMcap } from '@/lib/format';
import { CATEGORY_LABELS } from './constants';

interface AgentCardProps {
  agent: AtelierAgentListItem;
  marketData?: MarketData | null;
  onHire?: () => void;
}

export function AgentCard({ agent, marketData, onHire }: AgentCardProps) {
  const [copied, setCopied] = useState(false);
  const avatarLetter = agent.name.charAt(0).toUpperCase();
  const imageSrc = agent.token_image_url || agent.avatar_url;
  const primaryCategory = agent.categories[0];
  const hasToken = !!agent.token_symbol;

  function copyCA() {
    if (!agent.token_mint) return;
    navigator.clipboard.writeText(agent.token_mint);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="overflow-hidden rounded-lg bg-gray-50 dark:bg-black-soft transition-all duration-200 hover:shadow-lg flex flex-col border border-gray-200 dark:border-neutral-800 hover:border-atelier/40 dark:hover:border-atelier/40 hover:shadow-atelier/5">
      {/* Image */}
      <Link href={atelierHref(`/atelier/agents/${agent.slug}`)} className="relative block aspect-[4/3] bg-gray-100 dark:bg-neutral-900 overflow-hidden">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={agent.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-atelier/10">
            <span className="text-4xl font-bold font-display text-atelier/60">{avatarLetter}</span>
          </div>
        )}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-2">
          {primaryCategory && (
            <span className="px-2 py-0.5 rounded-full text-2xs font-mono font-semibold bg-black/60 text-white backdrop-blur-sm">
              {CATEGORY_LABELS[primaryCategory as ServiceCategory] || primaryCategory}
            </span>
          )}
          {agent.is_atelier_official === 1 && (
            <span className="px-2 py-0.5 rounded-full text-2xs font-mono font-semibold bg-atelier text-white ml-auto">
              by ATELIER
            </span>
          )}
          {agent.partner_badge && agent.is_atelier_official !== 1 && (
            <span className="px-2 py-0.5 rounded-full text-2xs font-mono font-semibold bg-white/90 text-black ml-auto">
              {agent.partner_badge}
            </span>
          )}
        </div>
      </Link>

      {/* Name */}
      <div className="px-3 pt-3">
        <Link href={atelierHref(`/atelier/agents/${agent.slug}`)} className="font-bold font-display text-sm text-black dark:text-white truncate flex items-center gap-1 hover:text-atelier transition-colors">
          {agent.name}
          {agent.blue_check === 1 && (
            <svg className="w-4 h-4 text-blue-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.403 12.652a3 3 0 010-5.304 3 3 0 00-3.75-3.751 3 3 0 00-5.305 0 3 3 0 00-3.751 3.75 3 3 0 000 5.305 3 3 0 003.75 3.751 3 3 0 005.305 0 3 3 0 003.751-3.75zm-2.546-4.46a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
          )}
        </Link>
      </div>

      {/* Token info block */}
      <div className="px-3 pt-2">
        {hasToken && agent.token_mint ? (
          <button
            onClick={copyCA}
            className={`relative inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 cursor-pointer transition-all duration-200 ${
              copied
                ? 'bg-green-500/15 dark:bg-green-500/20 scale-[1.03]'
                : 'bg-atelier/10 dark:bg-atelier/15 hover:bg-atelier/20 dark:hover:bg-atelier/25 active:scale-95'
            }`}
          >
            <span className={`text-sm font-mono font-bold transition-colors duration-200 ${copied ? 'text-green-500' : 'text-atelier'}`}>
              {copied ? 'Copied!' : `$${agent.token_symbol}`}
            </span>
            {!copied && marketData && marketData.market_cap_usd > 0 && (
              <>
                <span className="w-px h-3.5 bg-atelier/30" />
                <span className="text-xs font-mono font-medium text-atelier/80">mcap {formatMcap(marketData.market_cap_usd)}</span>
              </>
            )}
          </button>
        ) : (
          <span className="inline-flex items-center rounded-md px-2.5 py-1.5 bg-gray-100 dark:bg-neutral-800/40">
            <span className="text-sm font-mono font-bold text-gray-400 dark:text-neutral-500">No Token</span>
          </span>
        )}
      </div>

      {/* Description */}
      {agent.description && (
        <p className="text-xs text-gray-500 dark:text-neutral-400 line-clamp-2 px-3 pt-1.5">{agent.description}</p>
      )}

      {/* Model tags */}
      {agent.provider_models.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pt-1.5">
          {agent.provider_models.map((m) => (
            <span key={m} className="px-1.5 py-0.5 rounded text-2xs font-mono bg-gray-200 dark:bg-neutral-800/60 text-gray-500 dark:text-neutral-400">
              {m}
            </span>
          ))}
        </div>
      )}

      <div className="mx-3 mt-2 border-t border-gray-200 dark:border-neutral-800" />

      {/* Stats + Hire */}
      <div className="px-3 py-2.5 mt-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {agent.min_price_usd != null && (
            <span className="text-xs font-mono font-semibold text-black dark:text-white">
              from ${agent.min_price_usd % 1 === 0 ? agent.min_price_usd.toFixed(0) : agent.min_price_usd.toFixed(2)}
            </span>
          )}
          {agent.avg_rating != null && (
            <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-neutral-400 font-mono">
              <svg className="w-3.5 h-3.5 text-atelier" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {agent.avg_rating.toFixed(1)}
            </span>
          )}
          {agent.total_orders > 0 && (
            <span className="text-xs text-gray-500 dark:text-neutral-400 font-mono">
              {agent.total_orders} orders
            </span>
          )}
        </div>
        <button
          onClick={(e) => {
            e.preventDefault();
            onHire?.();
          }}
          className="px-3 py-1 rounded border border-atelier/40 text-atelier text-xs font-medium font-mono transition-all duration-200 hover:bg-atelier hover:text-white hover:border-atelier"
        >
          Hire
        </button>
      </div>
    </div>
  );
}
