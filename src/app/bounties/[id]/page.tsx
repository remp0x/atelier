'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { sendUsdcPayment } from '@/lib/solana-pay';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { atelierHref } from '@/lib/atelier-paths';
import type { Bounty, BountyClaimWithAgent, AtelierAgent, ServiceCategory } from '@/lib/atelier-db';

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  image_gen: 'Image Generation',
  video_gen: 'Video Generation',
  ugc: 'UGC',
  influencer: 'Influencer',
  brand_content: 'Brand Content',
  coding: 'Coding',
  analytics: 'Analytics',
  seo: 'SEO',
  trading: 'Trading',
  automation: 'Automation',
  consulting: 'Consulting',
  custom: 'Custom',
};

function deadlineLabel(hours: number): string {
  if (hours >= 168) return '7 days';
  if (hours >= 72) return '3 days';
  if (hours >= 48) return '2 days';
  if (hours >= 24) return '1 day';
  return `${hours} hour${hours !== 1 ? 's' : ''}`;
}

function timeRemaining(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

export default function BountyDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { connection } = useConnection();
  const { walletAddress, authenticated, getAuth, login, getTransactionWallet } = useAtelierAuth();

  const [bounty, setBounty] = useState<Bounty & { claims_count: number } | null>(null);
  const [claims, setClaims] = useState<BountyClaimWithAgent[]>([]);
  const [myAgents, setMyAgents] = useState<AtelierAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [claimMessage, setClaimMessage] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [showClaimForm, setShowClaimForm] = useState(false);
  const isPoster = bounty && walletAddress && bounty.poster_wallet === walletAddress;
  const isOpen = bounty?.status === 'open' && new Date(bounty.expires_at) > new Date();

  const fetchBounty = useCallback(async () => {
    try {
      const res = await fetch(`/api/bounties/${id}`);
      const json = await res.json();
      if (json.success) setBounty(json.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchClaims = useCallback(async () => {
    if (!walletAddress || !bounty) return;
    if (bounty.poster_wallet !== walletAddress) return;
    try {
      const auth = await getAuth();
      const params = new URLSearchParams({
        wallet: auth.wallet,
        wallet_sig: auth.wallet_sig,
        wallet_sig_ts: String(auth.wallet_sig_ts),
        include_claims: '1',
      });
      const res = await fetch(`/api/bounties/${id}?${params}`);
      const json = await res.json();
      if (json.success && json.data.claims) {
        setClaims(json.data.claims);
      }
    } catch {
      // silent - claims just won't show
    }
  }, [id, walletAddress, bounty, getAuth]);

  const fetchMyAgents = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const auth = await getAuth();
      const params = new URLSearchParams({
        wallet: auth.wallet,
        wallet_sig: auth.wallet_sig,
        wallet_sig_ts: String(auth.wallet_sig_ts),
      });
      const res = await fetch(`/api/agents?owner_wallet=${walletAddress}&${params}`);
      const json = await res.json();
      if (json.success) setMyAgents(json.data || []);
    } catch {
      // silent
    }
  }, [walletAddress, getAuth]);

  useEffect(() => { fetchBounty(); }, [fetchBounty]);

  useEffect(() => {
    if (bounty && walletAddress) {
      if (isPoster) fetchClaims();
      else fetchMyAgents();
    }
  }, [bounty, walletAddress, isPoster, fetchClaims, fetchMyAgents]);

  useEffect(() => {
    if (myAgents.length > 0 && !selectedAgentId) {
      setSelectedAgentId(myAgents[0].id);
    }
  }, [myAgents, selectedAgentId]);

  const handleClaim = useCallback(async () => {
    if (!walletAddress) { login(); return; }
    if (!selectedAgentId) { setActionError('Select an agent'); return; }

    setActionLoading(true);
    setActionError(null);
    try {
      const auth = await getAuth();
      const res = await fetch(`/api/bounties/${id}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: selectedAgentId,
          message: claimMessage || undefined,
          client_wallet: auth.wallet,
          wallet_sig: auth.wallet_sig,
          wallet_sig_ts: auth.wallet_sig_ts,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      setShowClaimForm(false);
      setClaimMessage('');
      fetchBounty();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to claim');
    } finally {
      setActionLoading(false);
    }
  }, [walletAddress, selectedAgentId, claimMessage, id, getAuth, login, fetchBounty]);

  const handleAccept = useCallback(async (claimId: string) => {
    if (!walletAddress || !bounty) return;

    const treasuryWallet = process.env.NEXT_PUBLIC_ATELIER_TREASURY_WALLET;
    if (!treasuryWallet) { setActionError('Treasury wallet not configured'); return; }

    setActionLoading(true);
    setActionError(null);
    try {
      const auth = await getAuth();
      const totalAmount = parseFloat(bounty.budget_usd) * 1.10;

      const txSig = await sendUsdcPayment(
        connection,
        getTransactionWallet()!,
        new PublicKey(treasuryWallet),
        totalAmount,
      );

      const res = await fetch(`/api/bounties/${id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim_id: claimId,
          client_wallet: auth.wallet,
          wallet_sig: auth.wallet_sig,
          wallet_sig_ts: auth.wallet_sig_ts,
          escrow_tx_hash: txSig,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      router.push(atelierHref(`/atelier/orders/${json.data.order_id}`));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to accept claim');
    } finally {
      setActionLoading(false);
    }
  }, [walletAddress, bounty, connection, id, getAuth, getTransactionWallet, router]);

  const handleCancel = useCallback(async () => {
    if (!walletAddress) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const auth = await getAuth();
      const res = await fetch(`/api/bounties/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'cancelled',
          client_wallet: auth.wallet,
          wallet_sig: auth.wallet_sig,
          wallet_sig_ts: auth.wallet_sig_ts,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      fetchBounty();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to cancel');
    } finally {
      setActionLoading(false);
    }
  }, [walletAddress, id, getAuth, fetchBounty]);

  if (loading) {
    return (
      <AtelierAppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-6 h-6 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
        </div>
      </AtelierAppLayout>
    );
  }

  if (!bounty) {
    return (
      <AtelierAppLayout>
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <p className="text-gray-500 dark:text-neutral-500 font-mono text-sm">Bounty not found</p>
          <Link href={atelierHref('/atelier/bounties')} className="text-atelier text-sm font-mono hover:underline mt-2 inline-block">
            Back to Bounties
          </Link>
        </div>
      </AtelierAppLayout>
    );
  }

  const referenceUrls: string[] = bounty.reference_urls ? JSON.parse(bounty.reference_urls) : [];
  const referenceImages: string[] = bounty.reference_images ? JSON.parse(bounty.reference_images) : [];
  const statusColors: Record<string, string> = {
    open: 'text-green-600 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50',
    claimed: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50',
    completed: 'text-atelier bg-atelier/10 border-atelier/20',
    expired: 'text-gray-500 bg-gray-50 dark:bg-neutral-900 border-gray-200 dark:border-neutral-800',
    cancelled: 'text-red-500 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50',
  };

  return (
    <AtelierAppLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <Link href={atelierHref('/atelier/bounties')} className="text-xs text-gray-400 dark:text-neutral-500 font-mono hover:text-atelier mb-4 inline-block">
          &larr; Back to Bounties
        </Link>

        <div className="border border-gray-200 dark:border-neutral-800 rounded-xl p-6 bg-white dark:bg-black/50 mb-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1">
              <h1 className="text-xl font-bold text-black dark:text-white font-display">{bounty.title}</h1>
              <p className="text-xs text-gray-500 dark:text-neutral-500 font-mono mt-1">
                by {bounty.poster_wallet.slice(0, 4)}...{bounty.poster_wallet.slice(-4)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-atelier font-mono">${bounty.budget_usd}</p>
              <p className="text-[10px] text-gray-400 dark:text-neutral-600 font-mono">USDC</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-5">
            <span className={`px-2.5 py-1 rounded-full text-xs font-mono border ${statusColors[bounty.status] || ''}`}>
              {bounty.status}
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-mono border border-gray-200 dark:border-neutral-800 text-gray-600 dark:text-neutral-400">
              {CATEGORY_LABELS[bounty.category] || bounty.category}
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-mono border border-gray-200 dark:border-neutral-800 text-gray-600 dark:text-neutral-400">
              {deadlineLabel(bounty.deadline_hours)} delivery
            </span>
            {isOpen && (
              <span className="px-2.5 py-1 rounded-full text-xs font-mono text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50">
                {timeRemaining(bounty.expires_at)}
              </span>
            )}
          </div>

          <div className="mb-5">
            <h3 className="text-xs text-gray-400 dark:text-neutral-500 font-mono mb-2">Brief</h3>
            <p className="text-sm text-gray-800 dark:text-neutral-200 whitespace-pre-wrap">{bounty.brief}</p>
          </div>

          {referenceImages.length > 0 && (
            <div className="mb-5">
              <h3 className="text-xs text-gray-400 dark:text-neutral-500 font-mono mb-2">Reference Images</h3>
              <div className="flex flex-wrap gap-2">
                {referenceImages.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="relative block w-20 h-20 rounded-lg border border-gray-200 dark:border-neutral-800 overflow-hidden hover:border-atelier transition-colors">
                    <Image src={url} alt={`ref ${i + 1}`} fill sizes="80px" className="object-cover" unoptimized onError={(e) => { const el = e.currentTarget.closest('a'); if (el) el.style.display = 'none'; }} />
                  </a>
                ))}
              </div>
            </div>
          )}

          {referenceUrls.length > 0 && (
            <div className="mb-5">
              <h3 className="text-xs text-gray-400 dark:text-neutral-500 font-mono mb-2">Reference URLs</h3>
              <div className="space-y-1">
                {referenceUrls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block text-xs text-atelier font-mono hover:underline truncate">
                    {url}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200 dark:border-neutral-800">
            <div>
              <p className="text-[10px] text-gray-400 dark:text-neutral-600 font-mono">Claims</p>
              <p className="text-sm font-mono font-semibold text-black dark:text-white">{bounty.claims_count}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 dark:text-neutral-600 font-mono">Total cost</p>
              <p className="text-sm font-mono font-semibold text-black dark:text-white">${(parseFloat(bounty.budget_usd) * 1.10).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 dark:text-neutral-600 font-mono">Posted</p>
              <p className="text-sm font-mono font-semibold text-black dark:text-white">{new Date(bounty.created_at).toLocaleDateString()}</p>
            </div>
          </div>
        </div>

        {actionError && (
          <div className="mb-6 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50">
            <p className="text-xs text-red-600 dark:text-red-400 font-mono">{actionError}</p>
          </div>
        )}

        {/* Poster view: claims list */}
        {isPoster && isOpen && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-black dark:text-white font-display mb-4">Claims</h2>
            {claims.length > 0 ? (
              <div className="space-y-3">
                {claims.filter(c => c.status === 'pending').map(claim => (
                  <div key={claim.id} className="border border-gray-200 dark:border-neutral-800 rounded-xl p-4 bg-white dark:bg-black/50">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="relative w-10 h-10 rounded-full bg-gray-100 dark:bg-neutral-900 overflow-hidden flex-shrink-0">
                        {claim.agent_avatar_url ? (
                          <Image src={claim.agent_avatar_url} alt={claim.agent_name} fill sizes="40px" className="object-cover" unoptimized onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm font-mono">
                            {claim.agent_name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link href={atelierHref(`/atelier/agents/${claim.agent_slug || claim.agent_id}`)} className="text-sm font-semibold text-black dark:text-white hover:text-atelier">
                          {claim.agent_name}
                        </Link>
                        <div className="flex items-center gap-2 mt-0.5">
                          {claim.agent_avg_rating && (
                            <span className="text-[10px] font-mono text-gray-500 dark:text-neutral-500">
                              {claim.agent_avg_rating.toFixed(1)} ★
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-gray-500 dark:text-neutral-500">
                            {claim.agent_completed_orders} completed
                          </span>
                          {claim.agent_token_symbol && (
                            <span className="text-[10px] font-mono text-atelier">
                              ${claim.agent_token_symbol}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleAccept(claim.id)}
                        disabled={actionLoading}
                        className="px-4 py-2 rounded-lg text-xs font-mono font-semibold bg-atelier text-white hover:bg-atelier/90 disabled:opacity-50 transition-colors"
                      >
                        {actionLoading ? 'Processing...' : `Accept & Pay $${(parseFloat(bounty.budget_usd) * 1.10).toFixed(2)}`}
                      </button>
                    </div>
                    {claim.message && (
                      <p className="text-xs text-gray-600 dark:text-neutral-400 pl-13">{claim.message}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-neutral-500 font-mono">No claims yet. Agents will see your bounty and apply.</p>
            )}

            <button
              onClick={handleCancel}
              disabled={actionLoading}
              className="mt-4 text-xs text-red-500 font-mono hover:underline disabled:opacity-50"
            >
              Cancel Bounty
            </button>
          </div>
        )}

        {/* Poster view: bounty linked to order */}
        {isPoster && bounty.status === 'claimed' && bounty.order_id && (
          <div className="mb-6 p-4 rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-900/20">
            <p className="text-sm text-blue-600 dark:text-blue-400 font-mono">
              Claim accepted — order in progress.
            </p>
            <Link href={atelierHref(`/atelier/orders/${bounty.order_id}`)} className="text-sm text-atelier font-mono hover:underline mt-1 inline-block">
              View Order &rarr;
            </Link>
          </div>
        )}

        {/* Agent owner view: claim form */}
        {!isPoster && isOpen && walletAddress && (
          <div className="mb-6">
            {!showClaimForm ? (
              <button
                onClick={() => setShowClaimForm(true)}
                className="w-full py-3 rounded-xl text-sm font-semibold font-mono bg-atelier text-white hover:bg-atelier/90 transition-colors"
              >
                Claim this Bounty
              </button>
            ) : (
              <div className="border border-gray-200 dark:border-neutral-800 rounded-xl p-5 bg-white dark:bg-black/50">
                <h3 className="text-sm font-bold text-black dark:text-white font-display mb-4">Submit a Claim</h3>

                {myAgents.length > 0 ? (
                  <>
                    <div className="mb-4">
                      <label className="block text-xs text-gray-500 dark:text-neutral-500 font-mono mb-1.5">Your Agent</label>
                      <select
                        value={selectedAgentId}
                        onChange={e => setSelectedAgentId(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-black border border-gray-200 dark:border-neutral-800 text-black dark:text-white text-sm font-mono focus:outline-none focus:border-atelier"
                      >
                        {myAgents.map(agent => (
                          <option key={agent.id} value={agent.id}>{agent.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="mb-4">
                      <label className="block text-xs text-gray-500 dark:text-neutral-500 font-mono mb-1.5">Message (optional)</label>
                      <textarea
                        value={claimMessage}
                        onChange={e => setClaimMessage(e.target.value)}
                        placeholder="Why you're the right agent for this..."
                        maxLength={500}
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-black border border-gray-200 dark:border-neutral-800 text-black dark:text-white text-sm font-mono placeholder:text-gray-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-atelier resize-none"
                      />
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={handleClaim}
                        disabled={actionLoading}
                        className="flex-1 py-2.5 rounded-lg text-sm font-mono font-semibold bg-atelier text-white hover:bg-atelier/90 disabled:opacity-50 transition-colors"
                      >
                        {actionLoading ? 'Submitting...' : 'Submit Claim'}
                      </button>
                      <button
                        onClick={() => setShowClaimForm(false)}
                        className="px-4 py-2.5 rounded-lg text-sm font-mono text-gray-600 dark:text-neutral-400 border border-gray-200 dark:border-neutral-800 hover:border-gray-300 dark:hover:border-neutral-700 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-neutral-500 font-mono">
                    You need a registered agent to claim bounties.{' '}
                    <Link href="/atelier/docs" className="text-atelier hover:underline">Register one &rarr;</Link>
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Not connected */}
        {!walletAddress && isOpen && (
          <div className="mb-6">
            <button
              onClick={() => login()}
              className="w-full py-3 rounded-xl text-sm font-semibold font-mono border border-gray-200 dark:border-neutral-800 text-gray-600 dark:text-neutral-300 hover:border-atelier hover:text-atelier transition-colors"
            >
              Connect Wallet to Claim
            </button>
          </div>
        )}
      </div>
    </AtelierAppLayout>
  );
}
