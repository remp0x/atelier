'use client';

import Link from 'next/link';
import { atelierHref } from '@/lib/atelier-paths';
import { AgentAvatar } from '@/components/atelier/AgentAvatar';
import type { BountyListItem, ServiceCategory } from '@/lib/atelier-db';

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  image_gen: 'Image',
  video_gen: 'Video',
  ugc: 'UGC',
  influencer: 'Influencer',
  brand_content: 'Brand',
  coding: 'Coding',
  analytics: 'Analytics',
  seo: 'SEO',
  trading: 'Trading',
  automation: 'Automation',
  consulting: 'Consulting',
  custom: 'Custom',
};

function timeRemaining(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours >= 24) return `${Math.floor(hours / 24)}d left`;
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

function deadlineLabel(hours: number): string {
  if (hours >= 168) return '7d delivery';
  if (hours >= 72) return '3d delivery';
  if (hours >= 48) return '2d delivery';
  if (hours >= 24) return '1d delivery';
  return `${hours}h delivery`;
}

function formatCompletedDate(completedAt: string): string {
  return new Date(completedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface FeaturedBountyCardProps {
  bounty: BountyListItem;
}

export function FeaturedBountyCard({ bounty }: FeaturedBountyCardProps) {
  const isCompleted = bounty.status === 'completed';
  const isExpired =
    bounty.status === 'expired' ||
    (!isCompleted && new Date(bounty.expires_at) < new Date());
  const posterLabel =
    bounty.poster_display_name ||
    `${bounty.poster_wallet.slice(0, 4)}...${bounty.poster_wallet.slice(-4)}`;
  const earnedAmount = bounty.earned_usd ?? bounty.budget_usd;

  return (
    <Link
      href={atelierHref(`/atelier/bounties/${bounty.id}`)}
      className="group relative block h-full overflow-hidden rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-black-soft hover:border-atelier/40 hover:shadow-xl hover:shadow-atelier/10 hover:-translate-y-0.5 transition-all duration-300"
    >
      {/* Aurora ambient layers — dark mode only */}
      <div
        className="absolute inset-0 pointer-events-none animate-pulse-atelier hidden dark:block"
        style={{
          background:
            'radial-gradient(circle at 10% 20%, var(--aurora-1) 0%, transparent 55%), radial-gradient(circle at 85% 80%, var(--aurora-5) 0%, transparent 55%)',
          opacity: 0.12,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none hidden dark:block"
        style={{
          background:
            'radial-gradient(circle at 70% 10%, var(--aurora-2) 0%, transparent 50%)',
          opacity: 0.06,
        }}
      />

      {/* Ambient glow — light mode only */}
      <div
        className="absolute inset-0 pointer-events-none block dark:hidden"
        style={{
          background:
            'radial-gradient(circle at 15% 20%, #ffb199 0%, transparent 50%)',
          opacity: 0.07,
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full p-6 sm:p-7">
        {/* Eyebrow */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[10px] font-mono font-semibold text-atelier uppercase tracking-widest">
            Featured
          </span>
          <span className="h-px flex-1 bg-atelier/20" />
        </div>

        {/* Title */}
        <h2 className="text-xl sm:text-2xl font-bold font-display text-black dark:text-white leading-tight line-clamp-2 mb-1.5">
          {bounty.title}
        </h2>

        {/* Poster */}
        <p className="text-xs font-mono text-gray-500 dark:text-neutral-400 mb-3">
          by {posterLabel}
        </p>

        {/* Brief */}
        <p className="text-sm text-gray-600 dark:text-neutral-400 line-clamp-3 mb-6 flex-1">
          {bounty.brief}
        </p>

        {/* Budget hero + winner */}
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <p className="text-[10px] font-mono text-gray-400 dark:text-neutral-500 uppercase tracking-wider mb-0.5">
              {isCompleted ? 'Earned' : 'Budget'}
            </p>
            <p className="text-3xl sm:text-4xl font-mono font-bold text-atelier leading-none">
              ${isCompleted ? earnedAmount : bounty.budget_usd}
              <span className="text-sm font-normal text-gray-400 dark:text-neutral-500 ml-1.5">
                USDC
              </span>
            </p>
          </div>

          {isCompleted && bounty.winner_agent_name && (
            <div className="flex flex-col items-end gap-1">
              <p className="text-[10px] font-mono text-gray-400 dark:text-neutral-500 uppercase tracking-wider">
                Winner
              </p>
              <div className="flex items-center gap-2">
                <AgentAvatar
                  name={bounty.winner_agent_name}
                  seed={bounty.winner_agent_id}
                  src={bounty.winner_agent_avatar_url}
                  className="w-6 h-6 rounded-full shrink-0"
                />
                <span className="text-xs font-mono text-black dark:text-white truncate max-w-[120px]">
                  {bounty.winner_agent_name}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer meta */}
        <div className="flex items-center flex-wrap gap-2 pt-4 border-t border-gray-200 dark:border-neutral-800">
          {isCompleted ? (
            <>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-medium text-atelier bg-atelier/10 border border-atelier/20">
                Completed
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono border border-gray-200 dark:border-neutral-800 text-gray-600 dark:text-neutral-400">
                {CATEGORY_LABELS[bounty.category] || bounty.category}
              </span>
              {bounty.completed_at && (
                <span className="ml-auto text-[11px] font-mono text-gray-400 dark:text-neutral-500">
                  {formatCompletedDate(bounty.completed_at)}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono border border-gray-200 dark:border-neutral-800 text-gray-600 dark:text-neutral-400">
                {CATEGORY_LABELS[bounty.category] || bounty.category}
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono border border-gray-200 dark:border-neutral-800 text-gray-600 dark:text-neutral-400">
                {deadlineLabel(bounty.deadline_hours)}
              </span>
              {!isExpired && (
                <span className="px-2.5 py-1 rounded-full text-[11px] font-mono text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50">
                  {timeRemaining(bounty.expires_at)}
                </span>
              )}
              {isExpired && (
                <span className="px-2.5 py-1 rounded-full text-[11px] font-mono text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50">
                  Expired
                </span>
              )}
              {bounty.claims_count > 0 && (
                <span className="px-2.5 py-1 rounded-full text-[11px] font-mono text-atelier bg-atelier/10 border border-atelier/20">
                  {bounty.claims_count} claim{bounty.claims_count !== 1 ? 's' : ''}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
