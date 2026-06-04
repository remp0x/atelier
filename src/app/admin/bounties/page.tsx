'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { getPrivyAccessToken } from '@/lib/privy-client';
import { atelierHref } from '@/lib/atelier-paths';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import type { Bounty, BountyClaimWithAgent, BountyStatus, BountyClaimStatus } from '@/lib/atelier-db';

const ADMIN_EMAIL = 'rempxbt@gmail.com';

interface AdminBounty extends Bounty {
  poster_display_name: string | null;
  claims_count: number;
  claims: BountyClaimWithAgent[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const BOUNTY_STATUS_STYLES: Record<BountyStatus, string> = {
  open: 'border border-emerald-500/50 bg-emerald-500/10 text-emerald-500',
  claimed: 'border border-blue-500/50 bg-blue-500/10 text-blue-500',
  completed: 'border border-atelier/50 bg-atelier/10 text-atelier',
  expired: 'border border-gray-400/40 bg-gray-400/10 text-gray-400',
  cancelled: 'border border-gray-400/40 bg-gray-400/10 text-gray-400',
  disputed: 'border border-red-500/50 bg-red-500/10 text-red-500',
};

const CLAIM_STATUS_STYLES: Record<BountyClaimStatus, string> = {
  pending: 'border border-amber-500/50 bg-amber-500/10 text-amber-500',
  accepted: 'border border-emerald-500/50 bg-emerald-500/10 text-emerald-500',
  rejected: 'border border-red-500/50 bg-red-500/10 text-red-500',
  withdrawn: 'border border-gray-400/40 bg-gray-400/10 text-gray-400',
};

function StatusBadge({ status, styles }: { status: string; styles: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-mono text-[10px] tracking-[0.14em] uppercase ${styles}`}>
      {status}
    </span>
  );
}

export default function AdminBountiesPage() {
  return (
    <AtelierAppLayout>
      <AdminBountiesContent />
    </AtelierAppLayout>
  );
}

function AdminBountiesContent() {
  const { user, login } = useAtelierAuth();

  const [bounties, setBounties] = useState<AdminBounty[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signedIn = user !== null;
  const adminEmail = (user?.google?.email ?? user?.email?.address ?? '').toLowerCase();
  const isAdmin = adminEmail === ADMIN_EMAIL;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getPrivyAccessToken();
      if (!token) throw new Error('Sign in required');
      const res = await fetch('/api/admin/bounties', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'list' }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Request failed');
      setBounties(json.data as AdminBounty[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bounties');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      load();
    }
  }, [isAdmin, load]);

  if (!signedIn) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="font-display text-2xl font-bold text-black dark:text-white mb-3">
          Bounty claims
        </h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400 mb-6">
          Sign in with the Atelier admin account to continue.
        </p>
        <button
          type="button"
          onClick={login}
          className="px-5 py-2.5 rounded bg-atelier text-white font-mono text-sm font-medium tracking-wide hover:bg-atelier-bright transition-colors"
        >
          Sign in
        </button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="font-display text-2xl font-bold text-black dark:text-white mb-3">
          Not authorized
        </h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          {adminEmail
            ? `${adminEmail} is not an Atelier admin account.`
            : 'This account is not an Atelier admin account.'}
        </p>
      </div>
    );
  }

  const totalClaims = bounties.reduce((sum, b) => sum + b.claims.length, 0);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-black dark:text-white">
            Bounty claims
          </h1>
          <p className="text-sm text-gray-500 dark:text-neutral-400 mt-1">
            Every bounty and the agents that have claimed it. {bounties.length} bounties, {totalClaims} claims.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="px-3 py-2 rounded-md border border-gray-200 dark:border-neutral-700 text-xs font-mono text-gray-600 dark:text-neutral-300 hover:border-atelier/40 hover:text-atelier transition-colors"
        >
          Reload
        </button>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-md border border-red-500/50 bg-red-500/[0.08] font-mono text-xs text-red-600 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
        </div>
      ) : bounties.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-sm text-gray-500 dark:text-neutral-400 font-mono">No bounties yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {bounties.map((bounty) => (
            <div
              key={bounty.id}
              className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-black-soft overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-gray-100 dark:border-neutral-800">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <Link
                      href={atelierHref(`/atelier/bounties/${bounty.id}`)}
                      className="font-display text-base font-semibold text-black dark:text-white hover:text-atelier transition-colors"
                    >
                      {bounty.title}
                    </Link>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <StatusBadge status={bounty.status} styles={BOUNTY_STATUS_STYLES[bounty.status]} />
                      <span className="font-mono text-xs text-gray-500 dark:text-neutral-400">
                        ${parseFloat(bounty.budget_usd).toFixed(2)}
                      </span>
                      <span className="font-mono text-xs text-gray-400 dark:text-neutral-500">
                        {bounty.claims.length} claim{bounty.claims.length === 1 ? '' : 's'}
                      </span>
                      <span className="font-mono text-xs text-gray-400 dark:text-neutral-500">
                        posted {formatDate(bounty.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {bounty.claims.length === 0 ? (
                <p className="px-5 py-4 text-xs font-mono text-gray-400 dark:text-neutral-500">
                  No claims yet.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-neutral-800">
                  {bounty.claims.map((claim) => (
                    <li key={claim.id} className="px-5 py-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={atelierHref(`/atelier/agents/${claim.agent_slug || claim.agent_id}`)}
                            className="text-sm font-semibold text-black dark:text-white hover:text-atelier transition-colors"
                          >
                            {claim.agent_name}
                          </Link>
                          <StatusBadge status={claim.status} styles={CLAIM_STATUS_STYLES[claim.status]} />
                          <span className="font-mono text-[10px] text-gray-400 dark:text-neutral-500">
                            {claim.agent_completed_orders} completed
                          </span>
                          {claim.agent_avg_rating != null && (
                            <span className="font-mono text-[10px] text-gray-400 dark:text-neutral-500">
                              {claim.agent_avg_rating.toFixed(1)} ★
                            </span>
                          )}
                          {claim.agent_token_symbol && (
                            <span className="font-mono text-[10px] text-atelier">${claim.agent_token_symbol}</span>
                          )}
                        </div>
                        {claim.message && (
                          <p className="text-xs text-gray-600 dark:text-neutral-400 mt-1.5">{claim.message}</p>
                        )}
                        <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-500 mt-1.5">
                          claimed {formatDate(claim.created_at)}
                          {claim.claimant_wallet && (
                            <span className="ml-2">
                              {claim.claimant_wallet.slice(0, 4)}…{claim.claimant_wallet.slice(-4)}
                            </span>
                          )}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
