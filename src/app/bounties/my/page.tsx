'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { atelierHref } from '@/lib/atelier-paths';
import type { BountyListItem, BountyStatus, ServiceCategory } from '@/lib/atelier-db';

const STATUS_TABS: { value: BountyStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'claimed', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
];

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  image_gen: 'Image', video_gen: 'Video', ugc: 'UGC',
  influencer: 'Influencer', brand_content: 'Brand', coding: 'Coding',
  analytics: 'Analytics', seo: 'SEO', trading: 'Trading',
  automation: 'Automation', consulting: 'Consulting', custom: 'Custom',
};

function statusBadge(status: string): string {
  switch (status) {
    case 'open': return 'text-green-600 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50';
    case 'claimed': return 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50';
    case 'completed': return 'text-atelier bg-atelier/10 border-atelier/20';
    case 'expired': return 'text-gray-500 bg-gray-50 dark:bg-neutral-900 border-gray-200 dark:border-neutral-800';
    case 'cancelled': return 'text-red-500 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50';
    default: return 'text-gray-500 border-gray-200 dark:border-neutral-800';
  }
}

export default function MyBountiesPage() {
  const { walletAddress, getAuth, login } = useAtelierAuth();

  const [bounties, setBounties] = useState<BountyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<BountyStatus | 'all'>('all');

  const fetchBounties = useCallback(async () => {
    if (!walletAddress) { setLoading(false); return; }
    setLoading(true);
    try {
      const auth = await getAuth();
      const params = new URLSearchParams({
        wallet: auth.wallet,
        wallet_sig: auth.wallet_sig,
        wallet_sig_ts: String(auth.wallet_sig_ts),
      });
      const res = await fetch(`/api/bounties/my?${params}`);
      const json = await res.json();
      if (json.success) setBounties(json.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [walletAddress, getAuth]);

  useEffect(() => { fetchBounties(); }, [fetchBounties]);

  const filtered = activeTab === 'all' ? bounties : bounties.filter(b => b.status === activeTab);

  if (!walletAddress) {
    return (
      <AtelierAppLayout>
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <p className="text-gray-500 dark:text-neutral-500 font-mono text-sm mb-4">Sign in to view your bounties</p>
          <button
            onClick={() => login()}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold font-mono text-white hover:opacity-90 transition-colors cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #fa4c14 0%, #ff7a3d 100%)' }}
          >
            Sign In
          </button>
        </div>
      </AtelierAppLayout>
    );
  }

  return (
    <AtelierAppLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-black dark:text-white font-display">My Bounties</h1>
            <p className="text-sm text-gray-500 dark:text-neutral-500 mt-1">Bounties you&apos;ve posted</p>
          </div>
          <Link
            href={atelierHref('/atelier/bounties')}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold font-mono bg-atelier text-white hover:bg-atelier/90 transition-colors"
          >
            Post a Bounty
          </Link>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-4 py-2 rounded-full text-sm font-mono transition-colors ${
                activeTab === tab.value
                  ? 'border border-atelier text-atelier bg-atelier/10'
                  : 'border border-gray-200 dark:border-neutral-800 text-gray-600 dark:text-neutral-300 hover:border-atelier/50'
              }`}
            >
              {tab.label}
              {tab.value !== 'all' && (
                <span className="ml-1.5 text-[10px] text-gray-400 dark:text-neutral-600">
                  {bounties.filter(b => b.status === tab.value).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length > 0 ? (
          <div className="space-y-3">
            {filtered.map(bounty => (
              <Link
                key={bounty.id}
                href={atelierHref(`/atelier/bounties/${bounty.id}`)}
                className="block border border-gray-200 dark:border-neutral-800 rounded-xl p-4 hover:border-atelier/50 transition-colors bg-white dark:bg-black/50"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-black dark:text-white truncate">{bounty.title}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${statusBadge(bounty.status)}`}>
                        {bounty.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-mono text-gray-500 dark:text-neutral-500">
                      <span>{CATEGORY_LABELS[bounty.category] || bounty.category}</span>
                      <span>{bounty.claims_count} claim{bounty.claims_count !== 1 ? 's' : ''}</span>
                      <span>{new Date(bounty.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-atelier font-mono whitespace-nowrap">${bounty.budget_usd}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-gray-500 dark:text-neutral-500 font-mono text-sm">
              {activeTab === 'all' ? 'No bounties yet' : `No ${activeTab} bounties`}
            </p>
          </div>
        )}
      </div>
    </AtelierAppLayout>
  );
}
