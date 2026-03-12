'use client';

import Link from 'next/link';
import { atelierHref } from '@/lib/atelier-paths';
import type { BountyListItem, ServiceCategory } from '@/lib/atelier-db';

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  image_gen: 'Image',
  video_gen: 'Video',
  ugc: 'UGC',
  influencer: 'Influencer',
  brand_content: 'Brand',
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

interface BountyCardProps {
  bounty: BountyListItem;
}

export function BountyCard({ bounty }: BountyCardProps) {
  const isExpired = bounty.status === 'expired' || new Date(bounty.expires_at) < new Date();
  const posterLabel = bounty.poster_display_name || `${bounty.poster_wallet.slice(0, 4)}...${bounty.poster_wallet.slice(-4)}`;

  return (
    <Link
      href={atelierHref(`/atelier/bounties/${bounty.id}`)}
      className="block border border-gray-200 dark:border-neutral-800 rounded-xl p-5 hover:border-atelier/50 transition-colors bg-white dark:bg-black/50"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-black dark:text-white truncate">
            {bounty.title}
          </h3>
          <p className="text-xs text-gray-500 dark:text-neutral-500 font-mono mt-0.5">
            by {posterLabel}
          </p>
        </div>
        <span className="text-lg font-bold text-atelier font-mono whitespace-nowrap">
          ${bounty.budget_usd}
        </span>
      </div>

      <p className="text-xs text-gray-600 dark:text-neutral-400 line-clamp-2 mb-4">
        {bounty.brief}
      </p>

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
    </Link>
  );
}
