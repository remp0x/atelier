'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';

const TREASURY_WALLET = 'EZkoXXZ5HEWdKwfv7wua7k6Dqv8aQxxHWNakq2gG2Qpb';

interface Partner {
  slug: string;
  name: string;
  wallet_address: string | null;
  fee_split_bps: number;
  active: number;
  created_at: string;
  updated_at: string;
}

interface ListingAgent {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  verified: number;
  is_atelier_official: number;
  services_count: number;
  avg_rating: number | null;
  curated: boolean;
}

interface PartnerPayoutRow {
  id: string;
  partner_slug: string;
  order_id: string;
  amount_usd: string;
  tx_hash: string | null;
  status: 'pending' | 'paid' | 'failed';
  error: string | null;
  created_at: string;
  paid_at: string | null;
}

function truncAddr(addr: string | null): string {
  if (!addr) return '—';
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function PartnersAdminPage() {
  return (
    <AtelierAppLayout>
      <PartnersContent />
    </AtelierAppLayout>
  );
}

function PartnersContent() {
  const { walletAddress, getAuth } = useAtelierAuth();
  const [adminKey, setAdminKey] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem('atelier_admin_key') || '';
  });

  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [listings, setListings] = useState<ListingAgent[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [listingsLoading, setListingsLoading] = useState(false);

  const [payouts, setPayouts] = useState<PartnerPayoutRow[]>([]);

  const [createForm, setCreateForm] = useState({ slug: '', name: '', wallet_address: '', fee_split_bps: 5000 });

  const isAdmin = walletAddress === TREASURY_WALLET;

  const adminCall = useCallback(async (path: string, extra: Record<string, unknown>) => {
    if (!adminKey) throw new Error('Missing admin key');
    const auth = await getAuth();
    const res = await fetch(path, {
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
  }, [adminKey, getAuth]);

  const loadPartners = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminCall('/api/admin/partners', { action: 'list' });
      setPartners(data as Partner[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load partners');
    } finally {
      setLoading(false);
    }
  }, [adminCall]);

  const loadListings = useCallback(async (slug: string, search: string) => {
    setListingsLoading(true);
    try {
      const data = await adminCall('/api/admin/partners/listings', {
        action: 'list',
        partner_slug: slug,
        search,
        limit: 50,
      });
      setListings((data as { agents: ListingAgent[] }).agents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load listings');
    } finally {
      setListingsLoading(false);
    }
  }, [adminCall]);

  const loadPayouts = useCallback(async (slug?: string) => {
    try {
      const data = await adminCall('/api/admin/partners/payouts', {
        partner_slug: slug,
        limit: 100,
      });
      setPayouts(data as PartnerPayoutRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payouts');
    }
  }, [adminCall]);

  useEffect(() => {
    if (isAdmin && adminKey) {
      loadPartners();
      loadPayouts();
    }
  }, [isAdmin, adminKey, loadPartners, loadPayouts]);

  useEffect(() => {
    if (selectedSlug) {
      loadListings(selectedSlug, searchQ);
    }
  }, [selectedSlug, searchQ, loadListings]);

  function saveAdminKey(key: string) {
    setAdminKey(key);
    if (key) sessionStorage.setItem('atelier_admin_key', key);
    else sessionStorage.removeItem('atelier_admin_key');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNewKey(null);
    try {
      const data = await adminCall('/api/admin/partners', {
        action: 'create',
        ...createForm,
      });
      setNewKey((data as { api_key: string }).api_key);
      setCreateForm({ slug: '', name: '', wallet_address: '', fee_split_bps: 5000 });
      await loadPartners();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  async function handleUpdate(slug: string, updates: {
    name?: string;
    wallet_address?: string | null;
    fee_split_bps?: number;
    active?: boolean;
  }) {
    setError(null);
    try {
      await adminCall('/api/admin/partners', { action: 'update', slug, ...updates });
      await loadPartners();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function handleRotateKey(slug: string) {
    if (!confirm(`Rotate API key for ${slug}? The old key will stop working.`)) return;
    setError(null);
    try {
      const data = await adminCall('/api/admin/partners', { action: 'rotate_key', slug });
      setNewKey((data as { api_key: string }).api_key);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rotate failed');
    }
  }

  async function toggleCuration(agentId: string, curated: boolean) {
    if (!selectedSlug) return;
    setError(null);
    try {
      await adminCall('/api/admin/partners/listings', {
        action: curated ? 'remove' : 'add',
        partner_slug: selectedSlug,
        agent_id: agentId,
      });
      await loadListings(selectedSlug, searchQ);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toggle failed');
    }
  }

  if (!walletAddress) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-neutral-500 font-mono text-sm">Sign in to access partners dashboard</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-neutral-500 font-mono text-sm">Admin only — connect treasury wallet</p>
      </div>
    );
  }

  if (!adminKey) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const key = new FormData(e.currentTarget as HTMLFormElement).get('key') as string;
            if (key) saveAdminKey(key.trim());
          }}
          className="flex flex-col gap-3 p-6 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800 w-full max-w-sm"
        >
          <p className="text-sm font-mono text-neutral-400">Enter admin key</p>
          <input
            name="key"
            type="password"
            autoFocus
            className="px-3 py-2 rounded-lg bg-white dark:bg-black-light border border-gray-200 dark:border-neutral-800 text-sm font-mono focus:outline-none focus:border-atelier/50"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded border border-atelier/60 text-atelier text-xs font-medium font-mono hover:bg-atelier hover:text-white transition-all"
          >
            Unlock
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-display">Partners Admin</h1>
        <button
          onClick={() => saveAdminKey('')}
          className="text-xs font-mono text-neutral-500 hover:text-atelier"
        >
          Lock
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-mono">
          {error}
        </div>
      )}

      {newKey && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm font-mono space-y-1">
          <p className="font-bold">New API key (shown once — copy now):</p>
          <code className="block break-all">{newKey}</code>
          <button
            onClick={() => setNewKey(null)}
            className="text-xs underline hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create Partner */}
      <section className="p-4 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800">
        <h2 className="text-lg font-bold font-display mb-3">Create Partner</h2>
        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <input
            placeholder="slug (e.g. nemo)"
            value={createForm.slug}
            onChange={(e) => setCreateForm({ ...createForm, slug: e.target.value })}
            className="px-3 py-2 rounded-lg bg-white dark:bg-black-light border border-gray-200 dark:border-neutral-800 text-sm font-mono focus:outline-none focus:border-atelier/50"
            required
          />
          <input
            placeholder="Display name"
            value={createForm.name}
            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
            className="px-3 py-2 rounded-lg bg-white dark:bg-black-light border border-gray-200 dark:border-neutral-800 text-sm font-mono focus:outline-none focus:border-atelier/50"
            required
          />
          <input
            placeholder="Solana wallet"
            value={createForm.wallet_address}
            onChange={(e) => setCreateForm({ ...createForm, wallet_address: e.target.value })}
            className="px-3 py-2 rounded-lg bg-white dark:bg-black-light border border-gray-200 dark:border-neutral-800 text-sm font-mono focus:outline-none focus:border-atelier/50"
          />
          <input
            type="number"
            placeholder="fee_split_bps"
            value={createForm.fee_split_bps}
            onChange={(e) => setCreateForm({ ...createForm, fee_split_bps: Number(e.target.value) })}
            className="px-3 py-2 rounded-lg bg-white dark:bg-black-light border border-gray-200 dark:border-neutral-800 text-sm font-mono focus:outline-none focus:border-atelier/50"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded border border-atelier/60 text-atelier text-xs font-medium font-mono hover:bg-atelier hover:text-white transition-all"
          >
            Create
          </button>
        </form>
      </section>

      {/* Partners List */}
      <section>
        <h2 className="text-lg font-bold font-display mb-3">Partners</h2>
        {loading ? (
          <p className="text-sm text-neutral-500 font-mono">Loading…</p>
        ) : partners.length === 0 ? (
          <p className="text-sm text-neutral-500 font-mono">No partners yet</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-neutral-800">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="bg-gray-50 dark:bg-black-soft text-neutral-500">
                  <th className="px-3 py-2 text-left">Slug</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Wallet</th>
                  <th className="px-3 py-2 text-right">Split (bps)</th>
                  <th className="px-3 py-2 text-center">Active</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {partners.map((p) => (
                  <tr key={p.slug} className="border-t border-gray-200 dark:border-neutral-800">
                    <td className="px-3 py-2 text-atelier">{p.slug}</td>
                    <td className="px-3 py-2">{p.name}</td>
                    <td className="px-3 py-2 text-neutral-400">
                      <input
                        defaultValue={p.wallet_address || ''}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (p.wallet_address || '')) {
                            handleUpdate(p.slug, { wallet_address: v || null });
                          }
                        }}
                        className="w-48 px-2 py-1 rounded bg-white dark:bg-black-light border border-gray-200 dark:border-neutral-800 text-2xs focus:outline-none focus:border-atelier/50"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        defaultValue={p.fee_split_bps}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isNaN(v) && v !== p.fee_split_bps) {
                            handleUpdate(p.slug, { fee_split_bps: v });
                          }
                        }}
                        className="w-20 px-2 py-1 rounded bg-white dark:bg-black-light border border-gray-200 dark:border-neutral-800 text-2xs text-right focus:outline-none focus:border-atelier/50"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => handleUpdate(p.slug, { active: p.active !== 1 })}
                        className={`px-1.5 py-0.5 rounded text-2xs ${
                          p.active === 1 ? 'bg-green-500/10 text-green-400' : 'bg-neutral-500/10 text-neutral-400'
                        }`}
                      >
                        {p.active === 1 ? 'active' : 'inactive'}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right space-x-2">
                      <button
                        onClick={() => {
                          setSelectedSlug(p.slug);
                          setSearchQ('');
                        }}
                        className="text-atelier hover:underline"
                      >
                        curate
                      </button>
                      <button
                        onClick={() => handleRotateKey(p.slug)}
                        className="text-amber-400 hover:underline"
                      >
                        rotate key
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Curation Panel */}
      {selectedSlug && (
        <section className="p-4 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold font-display">Curate agents for: {selectedSlug}</h2>
            <button
              onClick={() => setSelectedSlug(null)}
              className="text-xs font-mono text-neutral-500 hover:text-atelier"
            >
              Close
            </button>
          </div>
          <input
            placeholder="Search agents…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-black-light border border-gray-200 dark:border-neutral-800 text-sm font-mono mb-3 focus:outline-none focus:border-atelier/50"
          />
          {listingsLoading ? (
            <p className="text-sm text-neutral-500 font-mono">Loading…</p>
          ) : (
            <div className="max-h-96 overflow-y-auto space-y-1">
              {listings.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between px-3 py-2 rounded bg-white dark:bg-black-light border border-gray-200 dark:border-neutral-800"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {a.avatar_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{a.name}</p>
                      <p className="text-2xs font-mono text-neutral-500 truncate">
                        {a.services_count} services · {a.avg_rating ? `${a.avg_rating.toFixed(1)}★` : 'no ratings'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleCuration(a.id, a.curated)}
                    className={`px-3 py-1 rounded text-2xs font-mono border ${
                      a.curated
                        ? 'border-green-500/40 text-green-400 bg-green-500/10'
                        : 'border-gray-300 dark:border-neutral-700 text-neutral-500'
                    }`}
                  >
                    {a.curated ? 'curated' : 'add'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Payouts */}
      <section>
        <h2 className="text-lg font-bold font-display mb-3">Partner Payouts</h2>
        {payouts.length === 0 ? (
          <p className="text-sm text-neutral-500 font-mono">No payouts yet</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-neutral-800">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="bg-gray-50 dark:bg-black-soft text-neutral-500">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Partner</th>
                  <th className="px-3 py-2 text-left">Order</th>
                  <th className="px-3 py-2 text-right">Amount (USD)</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Tx</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id} className="border-t border-gray-200 dark:border-neutral-800">
                    <td className="px-3 py-2">{formatDate(p.created_at)}</td>
                    <td className="px-3 py-2 text-atelier">{p.partner_slug}</td>
                    <td className="px-3 py-2 text-neutral-400">{truncAddr(p.order_id)}</td>
                    <td className="px-3 py-2 text-right text-green-400">${p.amount_usd}</td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-2xs ${
                        p.status === 'paid' ? 'bg-green-500/10 text-green-400'
                          : p.status === 'failed' ? 'bg-red-500/10 text-red-400'
                          : 'bg-amber-400/10 text-amber-400'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {p.tx_hash ? (
                        <a
                          href={`https://solscan.io/tx/${p.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-atelier hover:underline"
                        >
                          {truncAddr(p.tx_hash)}
                        </a>
                      ) : p.error ? (
                        <span className="text-red-400" title={p.error}>error</span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
