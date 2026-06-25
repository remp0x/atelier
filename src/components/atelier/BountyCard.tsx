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

interface BountyCardProps {
  bounty: BountyListItem;
}

export function BountyCard({ bounty }: BountyCardProps) {
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
      className="block h-full border border-gray-200 dark:border-neutral-800 rounded-xl p-5 bg-white dark:bg-black-soft hover:border-atelier/40 hover:shadow-lg hover:shadow-atelier/5 hover:-translate-y-0.5 transition-all duration-300"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold font-display text-black dark:text-white truncate">
            {bounty.title}
          </h3>
          <p className="text-xs text-gray-500 dark:text-neutral-400 font-mono mt-0.5">
            by {posterLabel}
          </p>
        </div>
        <span className="text-base font-bold text-atelier font-mono whitespace-nowrap">
          ${bounty.budget_usd}
        </span>
      </div>

      <p className="text-xs text-gray-600 dark:text-neutral-400 line-clamp-2 mb-4">
        {bounty.brief}
      </p>

      {isCompleted ? (
        <div className="flex items-center flex-wrap gap-2">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-atelier bg-atelier/10 border border-atelier/20">
            Completed
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono border border-gray-200 dark:border-neutral-800 text-gray-600 dark:text-neutral-400">
            {CATEGORY_LABELS[bounty.category] || bounty.category}
          </span>
          {bounty.winner_agent_name ? (
            <span className="flex items-center gap-1.5 ml-auto">
              <span className="text-[10px] font-mono text-gray-500 dark:text-neutral-500">
                Won by
              </span>
              <AgentAvatar
                name={bounty.winner_agent_name}
                seed={bounty.winner_agent_id}
                src={bounty.winner_agent_avatar_url}
                className="w-5 h-5 rounded-full shrink-0"
              />
              <span className="text-[10px] font-mono text-black dark:text-white truncate max-w-[100px]">
                {bounty.winner_agent_name}
              </span>
            </span>
          ) : null}
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-atelier bg-atelier/10 border border-atelier/20 font-semibold whitespace-nowrap">
            ${earnedAmount} earned
          </span>
          {bounty.completed_at && (
            <span className="text-[10px] font-mono text-gray-400 dark:text-neutral-500 whitespace-nowrap">
              {formatCompletedDate(bounty.completed_at)}
            </span>
          )}
        </div>
      ) : (
        <div className="flex items-center flex-wrap gap-2">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono border border-gray-200 dark:border-neutral-800 text-gray-600 dark:text-neutral-400">
            {CATEGORY_LABELS[bounty.category] || bounty.category}
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono border border-gray-200 dark:border-neutral-800 text-gray-600 dark:text-neutral-400">
            {deadlineLabel(bounty.deadline_hours)}
          </span>
          {!isExpired && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50">
              {timeRemaining(bounty.expires_at)}
            </span>
          )}
          {isExpired && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50">
              Expired
            </span>
          )}
          {bounty.claims_count > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-atelier bg-atelier/10 border border-atelier/20">
              {bounty.claims_count} claim{bounty.claims_count !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
