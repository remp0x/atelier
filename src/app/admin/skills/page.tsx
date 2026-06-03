'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { getPrivyAccessToken } from '@/lib/privy-client';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';

const ADMIN_EMAIL = 'rempxbt@gmail.com';

interface SubmittedSkillRow {
  id: string;
  slug: string;
  creator_wallet: string;
  name: string;
  description: string;
  category: string;
  file_url: string;
  file_size: number;
  pricing: 'free' | 'paid';
  price_usdc: number;
  status: 'live' | 'removed';
  created_at: string;
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SkillsAdminPage() {
  return (
    <AtelierAppLayout>
      <SkillsAdminContent />
    </AtelierAppLayout>
  );
}

function SkillsAdminContent() {
  const { user, login } = useAtelierAuth();

  const [skills, setSkills] = useState<SubmittedSkillRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const signedIn = user !== null;
  const adminEmail = (user?.google?.email ?? user?.email?.address ?? '').toLowerCase();
  const isAdmin = adminEmail === ADMIN_EMAIL;

  const adminCall = useCallback(async (extra: Record<string, unknown>) => {
    const token = await getPrivyAccessToken();
    if (!token) throw new Error('Sign in required');
    const res = await fetch('/api/admin/skills', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(extra),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Request failed');
    return json.data;
  }, []);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminCall({ action: 'list' });
      setSkills(data as SubmittedSkillRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  }, [adminCall]);

  useEffect(() => {
    if (isAdmin) {
      loadSkills();
    }
  }, [isAdmin, loadSkills]);

  async function handleDelete(row: SubmittedSkillRow) {
    if (!confirm(`Delete "${row.name}"? This is permanent.`)) return;
    setError(null);
    setBusyId(row.id);
    try {
      await adminCall({ action: 'delete', id: row.id });
      await loadSkills();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  }

  async function handleStatus(row: SubmittedSkillRow, status: 'live' | 'removed') {
    setError(null);
    setBusyId(row.id);
    try {
      await adminCall({ action: 'set_status', id: row.id, status });
      await loadSkills();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  }

  if (!signedIn) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="font-display text-2xl font-bold text-black dark:text-white mb-3">
          Skills admin
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-black dark:text-white">
            Submitted skills
          </h1>
          <p className="text-sm text-gray-500 dark:text-neutral-400 mt-1">
            Community submissions go live automatically. Hide or delete anything that breaks the rules.
          </p>
        </div>
        <button
          type="button"
          onClick={loadSkills}
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
      ) : skills.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-sm text-gray-500 dark:text-neutral-400 font-mono">
            No community submissions yet.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 dark:border-neutral-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-neutral-900/60 text-xs font-mono uppercase tracking-wider text-gray-500 dark:text-neutral-400">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-left px-4 py-3">Creator</th>
                <th className="text-left px-4 py-3">Price</th>
                <th className="text-left px-4 py-3">File</th>
                <th className="text-left px-4 py-3">Submitted</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
              {skills.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-neutral-900/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/skills/community/${row.slug}`}
                      className="font-display font-semibold text-black dark:text-white hover:text-atelier transition-colors"
                    >
                      {row.name}
                    </Link>
                    <p className="text-xs text-gray-500 dark:text-neutral-500 mt-0.5 line-clamp-1">
                      {row.description}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-700 dark:text-neutral-300">
                    {row.category}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-700 dark:text-neutral-300">
                    {shortAddr(row.creator_wallet)}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono">
                    {row.pricing === 'free'
                      ? <span className="text-atelier">Free</span>
                      : `$${row.price_usdc.toFixed(row.price_usdc % 1 === 0 ? 0 : 2)}`}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-600 dark:text-neutral-400">
                    <a
                      href={row.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-atelier"
                    >
                      {formatBytes(row.file_size)} ↗
                    </a>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-600 dark:text-neutral-400">
                    {formatDate(row.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full font-mono text-[10px] tracking-[0.14em] uppercase ${
                        row.status === 'live'
                          ? 'border border-atelier/50 bg-atelier/10 text-atelier'
                          : 'border border-gray-300 dark:border-neutral-600 bg-gray-100 dark:bg-neutral-900/80 text-gray-500 dark:text-neutral-400'
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2 justify-end">
                      {row.status === 'live' ? (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => handleStatus(row, 'removed')}
                          className="px-2.5 h-7 rounded text-[11px] font-mono border border-gray-300 dark:border-neutral-700 text-gray-700 dark:text-neutral-300 hover:border-atelier/40 hover:text-atelier disabled:opacity-50"
                        >
                          Hide
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => handleStatus(row, 'live')}
                          className="px-2.5 h-7 rounded text-[11px] font-mono border border-atelier/50 bg-atelier/10 text-atelier hover:bg-atelier hover:text-white disabled:opacity-50"
                        >
                          Restore
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => handleDelete(row)}
                        className="px-2.5 h-7 rounded text-[11px] font-mono border border-red-500/40 text-red-500 hover:bg-red-500/10 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
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
