'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { getPrivyAccessToken } from '@/lib/privy-client';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';

const ADMIN_EMAIL = 'rempxbt@gmail.com';

interface PendingPayout {
  id: string;
  provider_agent_id: string;
  provider_name: string | null;
  service_title: string | null;
  payout_amount: number;
  payout_chain: 'solana' | 'base';
  wallet_available: boolean;
  destination_wallet: string | null;
  escrow_funded: boolean;
  completed_at: string | null;
}

interface RowState {
  releasing: boolean;
  tx_hash: string | null;
  error: string | null;
}

function truncWallet(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
}

function truncHash(hash: string): string {
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

export default function PayoutsAdminPage() {
  return (
    <AtelierAppLayout>
      <PayoutsContent />
    </AtelierAppLayout>
  );
}

function PayoutsContent() {
  const { user, login } = useAtelierAuth();

  const signedIn = user !== null;
  const adminEmail = (user?.google?.email ?? user?.email?.address ?? '').toLowerCase();
  const isAdmin = adminEmail === ADMIN_EMAIL;

  const [rows, setRows] = useState<PendingPayout[]>([]);
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [releaseAllProgress, setReleaseAllProgress] = useState<{ done: number; total: number } | null>(null);

  const loadPendingPayouts = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setFetchError(null);
    try {
      const token = await getPrivyAccessToken();
      if (!token) throw new Error('Sign in required');
      const res = await fetch('/api/orders/pending-payouts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Failed to load pending payouts');
      setRows(json.data ?? []);
      setRowStates({});
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load pending payouts');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadPendingPayouts();
  }, [loadPendingPayouts]);

  function setRowState(id: string, patch: Partial<RowState>) {
    setRowStates((prev) => {
      const current: RowState = prev[id] ?? { releasing: false, tx_hash: null, error: null };
      return { ...prev, [id]: { ...current, ...patch } };
    });
  }

  async function releaseOne(id: string): Promise<boolean> {
    setRowState(id, { releasing: true, error: null });
    try {
      const token = await getPrivyAccessToken();
      if (!token) throw new Error('Sign in required');
      const res = await fetch(`/api/orders/${id}/retry-payout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Payout failed');
      const tx: string = json.data?.tx_hash ?? '';
      setRowState(id, { releasing: false, tx_hash: tx });
      return true;
    } catch (err) {
      setRowState(id, { releasing: false, error: err instanceof Error ? err.message : 'Payout failed' });
      return false;
    }
  }

  async function handleReleaseAll() {
    const eligible = rows.filter((r) => r.wallet_available && !rowStates[r.id]?.tx_hash);
    if (eligible.length === 0) return;
    setReleaseAllProgress({ done: 0, total: eligible.length });
    for (let i = 0; i < eligible.length; i++) {
      await releaseOne(eligible[i].id);
      setReleaseAllProgress({ done: i + 1, total: eligible.length });
    }
    setReleaseAllProgress(null);
  }

  if (!signedIn) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="font-display text-2xl font-bold text-black dark:text-white mb-3">
          Payout Release Tool
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const pendingRows = rows.filter((r) => !(rowStates[r.id]?.tx_hash));
  const totalUsd = pendingRows.reduce((sum, r) => sum + r.payout_amount, 0);
  const eligibleCount = pendingRows.filter((r) => r.wallet_available).length;
  const isReleasingAll = releaseAllProgress !== null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-display">Payout Release Tool</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Manually release stuck order payouts that failed to send automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={loadPendingPayouts}
          disabled={loading}
          className="px-4 py-2 rounded border border-neutral-700 text-neutral-300 text-xs font-mono hover:border-neutral-500 hover:text-white transition-colors disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {fetchError && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-mono">
          {fetchError}
        </div>
      )}

      {/* Summary bar */}
      <div className="flex items-center gap-6 p-4 rounded-lg bg-black-soft border border-neutral-800">
        <div>
          <p className="text-xs text-neutral-500 font-mono">Pending payouts</p>
          <p className="text-xl font-bold font-mono">{pendingRows.length}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500 font-mono">Total owed</p>
          <p className="text-xl font-bold font-mono text-atelier">${totalUsd.toFixed(2)}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {isReleasingAll && releaseAllProgress && (
            <span className="text-xs font-mono text-neutral-400">
              {releaseAllProgress.done} / {releaseAllProgress.total}
            </span>
          )}
          <button
            type="button"
            onClick={handleReleaseAll}
            disabled={isReleasingAll || eligibleCount === 0}
            className="px-4 py-2 rounded bg-atelier text-white text-xs font-mono font-medium hover:bg-atelier-bright transition-colors disabled:opacity-50"
          >
            {isReleasingAll ? 'Releasing...' : `Release all (${eligibleCount})`}
          </button>
        </div>
      </div>

      {/* Payout rows */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-base font-mono text-neutral-400">No pending payouts</p>
          <p className="text-sm text-neutral-600 mt-1">All orders have been paid out.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const state: RowState = rowStates[row.id] ?? { releasing: false, tx_hash: null, error: null };
            const canRelease = row.wallet_available && !state.releasing && !isReleasingAll;

            return (
              <div
                key={row.id}
                className={`p-4 rounded-lg border bg-black-soft flex flex-col sm:flex-row sm:items-center gap-3 ${
                  state.tx_hash ? 'border-green-500/30' : 'border-neutral-800'
                }`}
              >
                {/* Left: provider + service info */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-medium text-white truncate">
                      {row.provider_name ?? row.provider_agent_id}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-2xs font-mono font-medium ${
                      row.payout_chain === 'solana'
                        ? 'bg-purple-500/10 text-purple-300'
                        : 'bg-blue-500/10 text-blue-300'
                    }`}>
                      {row.payout_chain.toUpperCase()}
                    </span>
                  </div>
                  {row.service_title && (
                    <p className="text-xs text-neutral-500 truncate">{row.service_title}</p>
                  )}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono text-xs text-neutral-500">
                      {row.destination_wallet ? truncWallet(row.destination_wallet) : 'No wallet'}
                    </span>
                    {row.completed_at && (
                      <span className="font-mono text-xs text-neutral-600">
                        {new Date(row.completed_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>

                  {/* Inline status messages */}
                  {state.error && (
                    <p className="text-xs font-mono text-red-400 mt-1">{state.error}</p>
                  )}
                  {state.tx_hash && (
                    <p className="text-xs font-mono text-green-400 mt-1">
                      tx: {truncHash(state.tx_hash)}
                    </p>
                  )}
                  {!row.wallet_available && !state.tx_hash && (
                    <p className="text-xs text-neutral-600 mt-1">
                      No payout address configured — agent must set one.
                    </p>
                  )}
                </div>

                {/* Right: amount + action */}
                <div className="flex items-center gap-4 shrink-0">
                  <span className="font-mono text-base font-semibold text-white">
                    ${row.payout_amount.toFixed(2)}
                  </span>
                  {state.tx_hash ? (
                    <span className="px-3 py-1.5 rounded border border-green-500/40 text-green-400 text-xs font-mono min-w-[120px] text-center">
                      Paid
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => releaseOne(row.id)}
                      disabled={!canRelease}
                      className="px-3 py-1.5 rounded border border-atelier/60 text-atelier text-xs font-mono hover:bg-atelier hover:text-white hover:border-atelier transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 min-w-[120px] justify-center"
                    >
                      {state.releasing && (
                        <span className="w-3 h-3 border border-atelier border-t-transparent rounded-full animate-spin" />
                      )}
                      {state.releasing ? 'Releasing...' : 'Release payout'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
