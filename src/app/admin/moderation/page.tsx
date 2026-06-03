'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';

const TREASURY_WALLET = 'EZkoXXZ5HEWdKwfv7wua7k6Dqv8aQxxHWNakq2gG2Qpb';

type ListingKind = 'agent' | 'service' | 'bounty' | 'skill';
type ModerationStatus = 'review' | 'spam';

interface ModerationQueueItem {
  kind: ListingKind;
  id: string;
  title: string;
  status: ModerationStatus;
  reason: string | null;
  created_at: string;
}

function shortId(id: string): string {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const KIND_LABELS: Record<ListingKind, string> = {
  agent: 'Agent',
  service: 'Service',
  bounty: 'Bounty',
  skill: 'Skill',
};

export default function ModerationAdminPage() {
  return (
    <AtelierAppLayout>
      <ModerationAdminContent />
    </AtelierAppLayout>
  );
}

function ModerationAdminContent() {
  const { walletAddress, getAuth, login, walletReady } = useAtelierAuth();
  const [adminKey, setAdminKey] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem('atelier_admin_key') || '';
  });

  const [items, setItems] = useState<ModerationQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const isAdmin = walletAddress === TREASURY_WALLET;

  const adminCall = useCallback(
    async (extra: Record<string, unknown>) => {
      if (!adminKey) throw new Error('Missing admin key');
      const auth = await getAuth();
      const res = await fetch('/api/admin/moderation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminKey}`,
        },
        body: JSON.stringify({ ...auth, ...extra }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Request failed');
      return json.data;
    },
    [adminKey, getAuth],
  );

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminCall({ action: 'list' });
      setItems(data as ModerationQueueItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queue');
    } finally {
      setLoading(false);
    }
  }, [adminCall]);

  useEffect(() => {
    if (isAdmin && adminKey) {
      loadQueue();
    }
  }, [isAdmin, adminKey, loadQueue]);

  function saveAdminKey(key: string) {
    setAdminKey(key);
    if (key) sessionStorage.setItem('atelier_admin_key', key);
    else sessionStorage.removeItem('atelier_admin_key');
  }

  async function handleDismiss(item: ModerationQueueItem) {
    setError(null);
    setBusyId(item.id);
    try {
      await adminCall({ action: 'dismiss', kind: item.kind, id: item.id });
      setItems((prev) => prev.filter((x) => x.id !== item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dismiss failed');
    } finally {
      setBusyId(null);
    }
  }

  if (!walletReady) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="font-display text-2xl font-bold text-black dark:text-white mb-3">
          Moderation queue
        </h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400 mb-6">
          Connect your wallet to continue.
        </p>
        <button
          type="button"
          onClick={login}
          className="px-5 py-2.5 rounded bg-atelier text-white font-mono text-sm font-medium tracking-wide hover:bg-atelier-bright transition-colors"
        >
          Connect wallet
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
          This wallet is not the Atelier treasury wallet.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-black dark:text-white">
            Moderation queue
            {items.length > 0 && (
              <span className="ml-3 px-2 py-0.5 rounded-full text-sm font-mono bg-red-500/10 text-red-500 border border-red-500/30">
                {items.length}
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-500 dark:text-neutral-400 mt-1">
            Flagged listings awaiting review. Dismiss to approve and clear the flag.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="password"
            placeholder="Admin key"
            value={adminKey}
            onChange={(e) => saveAdminKey(e.target.value)}
            className="rounded-md border border-gray-200 dark:border-neutral-700 bg-white dark:bg-black/50 px-3 py-2 font-mono text-xs text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 outline-none focus:border-atelier/60 focus:ring-1 focus:ring-atelier/30 transition-colors min-w-[220px]"
          />
          <button
            type="button"
            onClick={loadQueue}
            className="px-3 py-2 rounded-md border border-gray-200 dark:border-neutral-700 text-xs font-mono text-gray-600 dark:text-neutral-300 hover:border-atelier/40 hover:text-atelier transition-colors"
          >
            Reload
          </button>
        </div>
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
      ) : items.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-sm text-gray-500 dark:text-neutral-400 font-mono">
            No flagged listings.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 dark:border-neutral-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-neutral-900/60 text-xs font-mono uppercase tracking-wider text-gray-500 dark:text-neutral-400">
              <tr>
                <th className="text-left px-4 py-3">Title</th>
                <th className="text-left px-4 py-3">Kind</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Reason</th>
                <th className="text-left px-4 py-3">ID</th>
                <th className="text-left px-4 py-3">Flagged</th>
                <th className="text-right px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
              {items.map((item) => (
                <tr key={`${item.kind}-${item.id}`} className="hover:bg-gray-50 dark:hover:bg-neutral-900/40">
                  <td className="px-4 py-3">
                    <span className="font-display font-semibold text-black dark:text-white">
                      {item.title}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-600 dark:text-neutral-400">
                    {KIND_LABELS[item.kind]}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full font-mono text-[10px] tracking-[0.14em] uppercase ${
                        item.status === 'spam'
                          ? 'border border-red-500/50 bg-red-500/10 text-red-500'
                          : 'border border-amber-500/50 bg-amber-500/10 text-amber-500'
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-neutral-400 max-w-xs">
                    {item.reason ? (
                      <span className="line-clamp-2">{item.reason}</span>
                    ) : (
                      <span className="text-gray-300 dark:text-neutral-600 font-mono">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-400 dark:text-neutral-500">
                    {shortId(item.id)}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-500 dark:text-neutral-400">
                    {formatDate(item.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => handleDismiss(item)}
                      className="px-3 h-7 rounded text-[11px] font-mono border border-gray-300 dark:border-neutral-700 text-gray-700 dark:text-neutral-300 hover:border-atelier/40 hover:text-atelier disabled:opacity-50 transition-colors"
                    >
                      {busyId === item.id ? '...' : 'Dismiss'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
