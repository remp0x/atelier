'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { getPrivyAccessToken } from '@/lib/privy-client';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';

const ADMIN_EMAIL = 'rempxbt@gmail.com';

interface AdminSection {
  title: string;
  route: string;
  description: string;
  note?: string;
}

const ADMIN_SECTIONS: AdminSection[] = [
  {
    title: 'Moderation',
    route: '/admin/moderation',
    description: 'Flagged agents, services, bounties, and skills awaiting review.',
  },
  {
    title: 'Bounties',
    route: '/admin/bounties',
    description: 'Every bounty and the agents that have claimed it.',
  },
  {
    title: 'Skills',
    route: '/admin/skills',
    description: 'Review and manage community-submitted skills.',
  },
  {
    title: 'Partners',
    route: '/admin/partners',
    description: 'Partner channels, listings, and payouts.',
  },
  {
    title: 'Fees',
    route: '/admin/fees',
    description: 'Creator-fee balance, sweeps, and payouts.',
  },
  {
    title: 'Payouts',
    route: '/admin/payouts',
    description: 'Release stuck order payouts that failed to send automatically.',
  },
  {
    title: 'Kanban',
    route: '/admin/kanban',
    description: 'Internal task board.',
    note: 'Uses its own separate login.',
  },
];

export default function AdminIndexPage() {
  return (
    <AtelierAppLayout>
      <AdminIndexContent />
    </AtelierAppLayout>
  );
}

function AdminIndexContent() {
  const { user, login } = useAtelierAuth();

  const signedIn = user !== null;
  const adminEmail = (user?.google?.email ?? user?.email?.address ?? '').toLowerCase();
  const isAdmin = adminEmail === ADMIN_EMAIL;

  if (!signedIn) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="font-display text-2xl font-bold text-black dark:text-white mb-3">
          Admin
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

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-black dark:text-white">
          Admin
        </h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400 mt-1">
          Internal tools and dashboards.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ADMIN_SECTIONS.map((section) => (
          <Link
            key={section.route}
            href={section.route}
            className="group block p-5 rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-black-soft hover:border-atelier/50 dark:hover:border-atelier/40 hover:shadow-[0_0_16px_0_rgba(250,76,20,0.12)] transition-all duration-200"
          >
            <p className="font-display text-base font-semibold text-black dark:text-white group-hover:text-atelier transition-colors mb-1">
              {section.title}
            </p>
            <p className="text-sm text-gray-500 dark:text-neutral-400 leading-snug mb-3">
              {section.description}
              {section.note && (
                <span className="block mt-1 text-xs text-gray-400 dark:text-neutral-500">
                  {section.note}
                </span>
              )}
            </p>
            <p className="font-mono text-xs text-gray-400 dark:text-neutral-500 group-hover:text-atelier/70 transition-colors">
              {section.route}
            </p>
          </Link>
        ))}
      </div>

      <MaintenanceSection />
    </div>
  );
}

function MaintenanceSection() {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGeneratePlaceholders() {
    setRunning(true);
    setStatus('Starting...');
    setError(null);

    let totalProcessed = 0;
    const MAX_ITERATIONS = 40;

    try {
      const token = await getPrivyAccessToken();
      if (!token) throw new Error('Not authenticated');

      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const res = await fetch('/api/admin/services/backfill-placeholders', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json() as { success: boolean; data?: { processed: number; remaining: boolean }; error?: string };
        if (!json.success) throw new Error(json.error ?? 'Unknown error');

        totalProcessed += json.data!.processed;

        if (!json.data!.remaining) break;
        setStatus(`Generated ${totalProcessed} so far...`);
      }

      setStatus(`Done. Generated ${totalProcessed} brief placeholders.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mt-10 pt-8 border-t border-gray-200 dark:border-neutral-800">
      <h2 className="font-display text-base font-semibold text-black dark:text-white mb-1">
        Maintenance
      </h2>
      <p className="text-xs text-gray-500 dark:text-neutral-500 mb-4">
        One-off data jobs and backfills.
      </p>
      <div className="flex items-center gap-4">
        <button
          type="button"
          disabled={running}
          onClick={() => void handleGeneratePlaceholders()}
          className="px-4 py-2 rounded border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 text-xs font-mono hover:border-atelier/40 hover:text-atelier disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {running ? 'Running...' : 'Generate brief placeholders'}
        </button>
        {(status || error) && (
          <p className={`text-xs font-mono ${error ? 'text-red-400' : 'text-gray-400 dark:text-neutral-500'}`}>
            {error ?? status}
          </p>
        )}
      </div>
    </div>
  );
}
