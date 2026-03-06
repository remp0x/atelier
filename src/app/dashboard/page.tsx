'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import dynamic from 'next/dynamic';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { useWalletAuth } from '@/hooks/use-wallet-auth';
import type { AtelierAgent, Service, ServiceOrder, OrderStatus, ServiceCategory, ServicePriceType } from '@/lib/atelier-db';

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then(mod => mod.WalletMultiButton),
  { ssr: false }
);

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_quote: 'Pending Quote',
  quoted: 'Quoted',
  accepted: 'Accepted',
  paid: 'Paid',
  in_progress: 'In Progress',
  delivered: 'Delivered',
  completed: 'Completed',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<string, string> = {
  pending_quote: 'bg-gray-200 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300',
  quoted: 'bg-atelier/10 text-atelier',
  accepted: 'bg-atelier/15 text-atelier',
  paid: 'bg-atelier/20 text-atelier',
  in_progress: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  delivered: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  completed: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
  disputed: 'bg-red-500/15 text-red-600 dark:text-red-400',
  cancelled: 'bg-red-500/10 text-red-500',
};

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  image_gen: 'Image Gen',
  video_gen: 'Video Gen',
  ugc: 'UGC',
  influencer: 'Influencer',
  brand_content: 'Brand Content',
  custom: 'Custom',
};

const VALID_CATEGORIES: ServiceCategory[] = ['image_gen', 'video_gen', 'ugc', 'influencer', 'brand_content', 'custom'];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function truncateWallet(w: string | null): string {
  if (!w) return '\u2014';
  return `${w.slice(0, 4)}...${w.slice(-4)}`;
}

interface DashboardData {
  agents: AtelierAgent[];
  services: Record<string, Service[]>;
  orders: Record<string, ServiceOrder[]>;
  unreadCounts?: Record<string, Record<string, number>>;
}

export default function DashboardPage() {
  return (
    <AtelierAppLayout>
      <DashboardContent />
    </AtelierAppLayout>
  );
}

function DashboardContent() {
  const wallet = useWallet();
  const { getAuth } = useWalletAuth();
  const walletAddress = wallet.publicKey?.toBase58();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [showEditAgent, setShowEditAgent] = useState(false);
  const [showCreateService, setShowCreateService] = useState(false);
  const [showEditService, setShowEditService] = useState<Service | null>(null);
  const [deletingService, setDeletingService] = useState<string | null>(null);
  const [showDeliver, setShowDeliver] = useState<string | null>(null);
  const [showQuote, setShowQuote] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [editingPayout, setEditingPayout] = useState(false);
  const [payoutDraft, setPayoutDraft] = useState('');
  const [payoutSaving, setPayoutSaving] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);
    setError(null);
    try {
      const auth = await getAuth();
      const params = new URLSearchParams({
        wallet: auth.wallet,
        wallet_sig: auth.wallet_sig,
        wallet_sig_ts: String(auth.wallet_sig_ts),
      });
      const res = await fetch(`/api/dashboard?${params}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setData(json.data);
      if (json.data.agents.length > 0 && !selectedAgent) {
        setSelectedAgent(json.data.agents[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [walletAddress, wallet, selectedAgent]);

  useEffect(() => {
    if (walletAddress) {
      loadDashboard();
    } else if (!wallet.connecting) {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, wallet.connecting]);

  const copyApiKey = (key: string, agentId: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(agentId);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const deleteService = async (serviceId: string, apiKey: string) => {
    if (!confirm('Delete this service? This cannot be undone.')) return;
    setDeletingService(serviceId);
    try {
      const res = await fetch(`/api/services/${serviceId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const json = await res.json();
      if (json.success) loadDashboard();
    } finally {
      setDeletingService(null);
    }
  };

  const savePayoutWallet = async (agentApiKey: string, value: string | null) => {
    setPayoutSaving(true);
    setPayoutError(null);
    try {
      const res = await fetch('/api/agents/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${agentApiKey}` },
        body: JSON.stringify({ payout_wallet: value }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setEditingPayout(false);
      loadDashboard();
    } catch (e) {
      setPayoutError(e instanceof Error ? e.message : 'Failed to update payout wallet');
    } finally {
      setPayoutSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-6 h-6 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!walletAddress) {
    return (
      <div className="max-w-md mx-auto px-4 sm:px-6 py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-atelier/10 flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-atelier" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-black dark:text-white font-display mb-2">Connect Wallet</h2>
        <p className="text-sm text-gray-500 dark:text-neutral-400 font-mono mb-6">Connect your Solana wallet to manage your agents</p>
        <WalletMultiButton style={{ background: '#8B5CF6', color: 'white', fontSize: '0.875rem', fontWeight: 600, borderRadius: '8px', height: '2.75rem', padding: '0 1.5rem' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto px-4 sm:px-6 py-24 text-center">
        <p className="text-sm text-red-500 dark:text-red-400 font-mono mb-4">{error}</p>
        <button onClick={loadDashboard} className="text-sm font-mono text-atelier hover:underline cursor-pointer">Retry</button>
      </div>
    );
  }

  const agents = data?.agents || [];
  const agent = agents.find(a => a.id === selectedAgent);
  const agentServices = selectedAgent ? (data?.services[selectedAgent] || []) : [];
  const agentOrders = selectedAgent ? (data?.orders[selectedAgent] || []) : [];
  const totalRevenue = agentOrders.filter(o => o.status === 'completed' && o.quoted_price_usd).reduce((sum, o) => sum + parseFloat(o.quoted_price_usd || '0'), 0);
  const pendingOrders = agentOrders.filter(o => ['pending_quote', 'quoted', 'accepted', 'paid', 'in_progress'].includes(o.status)).length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-black dark:text-white font-display">Dashboard</h1>
          <p className="text-sm text-gray-400 dark:text-neutral-500 font-mono mt-1">{truncateWallet(walletAddress)}</p>
        </div>
        <button onClick={() => setShowRegister(true)} className="text-sm font-mono font-semibold text-white bg-atelier px-4 py-2.5 rounded-lg hover:bg-atelier-dark transition-colors cursor-pointer">
          {agents.length === 0 ? 'Register Agent' : '+ New Agent'}
        </button>
      </div>

      {agents.length === 0 && !showRegister ? (
        <div className="text-center py-16 bg-gray-50 dark:bg-neutral-950 border border-dashed border-gray-200 dark:border-neutral-800 rounded-xl">
          <div className="w-12 h-12 rounded-xl bg-atelier/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-atelier" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </div>
          <p className="text-sm text-gray-500 dark:text-neutral-400 font-mono mb-4">No agents registered for this wallet.</p>
          <button onClick={() => setShowRegister(true)} className="text-sm font-mono font-semibold text-atelier hover:text-atelier-dark dark:hover:text-atelier-bright transition-colors cursor-pointer">
            Register your first agent
          </button>
        </div>
      ) : (
        <>
          {agents.length > 1 && (
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-none">
              {agents.map(a => (
                <button key={a.id} onClick={() => setSelectedAgent(a.id)} className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-mono whitespace-nowrap transition-all cursor-pointer ${selectedAgent === a.id ? 'bg-atelier/10 text-atelier border border-atelier/30 shadow-[0_0_12px_rgba(139,92,246,0.1)]' : 'bg-gray-50 dark:bg-neutral-950 text-gray-500 dark:text-neutral-400 border border-gray-200 dark:border-neutral-800 hover:border-gray-300 dark:hover:border-neutral-700 hover:text-gray-700 dark:hover:text-neutral-300'}`}>
                  {a.avatar_url ? <img src={a.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" /> : <div className="w-5 h-5 rounded-full bg-atelier/20 flex items-center justify-center text-[10px] font-bold text-atelier">{a.name.charAt(0).toUpperCase()}</div>}
                  {a.name}
                </button>
              ))}
            </div>
          )}

          {agent && (
            <div className="space-y-6">
              {/* KPI Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard label="Services" value={String(agentServices.length)} accent="text-atelier" />
                <StatCard label="Completed" value={String(agent.completed_orders || 0)} accent="text-emerald-600 dark:text-emerald-400" />
                <StatCard label="Pending" value={String(pendingOrders)} accent="text-amber-600 dark:text-amber-400" />
                <StatCard label="Revenue" value={totalRevenue > 0 ? `$${totalRevenue.toFixed(0)}` : '$0'} accent="text-black dark:text-white" sub="USDC" />
              </div>

              {/* Agent Info */}
              <section className="bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-xl p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  {agent.avatar_url ? (
                    <img src={agent.avatar_url} alt={agent.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0 ring-2 ring-gray-200 dark:ring-neutral-800" />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-atelier/10 flex items-center justify-center text-atelier text-xl font-bold font-display flex-shrink-0 ring-2 ring-atelier/20">{agent.name.charAt(0).toUpperCase()}</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-lg font-bold text-black dark:text-white font-display">{agent.name}</h2>
                      {agent.verified === 1 && <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Verified</span>}
                      <button onClick={() => setShowEditAgent(true)} className="text-[11px] font-mono text-gray-400 dark:text-neutral-500 hover:text-atelier transition-colors ml-auto cursor-pointer">Edit</button>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-neutral-400 font-mono mt-1 line-clamp-2">{agent.description}</p>
                    <div className="flex items-center gap-4 mt-3 text-xs font-mono text-gray-400 dark:text-neutral-500">
                      <span>{agentServices.length} service{agentServices.length !== 1 ? 's' : ''}</span>
                      <span className="text-gray-300 dark:text-neutral-700">|</span>
                      <span>{agent.completed_orders} completed</span>
                      {agent.avg_rating && (<><span className="text-gray-300 dark:text-neutral-700">|</span><span className="text-amber-600 dark:text-amber-400">{Number(agent.avg_rating).toFixed(1)} rating</span></>)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5 pt-5 border-t border-gray-200 dark:border-neutral-800">
                  {/* API Key */}
                  <div className="bg-white dark:bg-black/40 rounded-lg p-4 border border-gray-100 dark:border-transparent">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono text-gray-400 dark:text-neutral-500 uppercase tracking-wider">API Key</span>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setShowApiKey(prev => ({ ...prev, [agent.id]: !prev[agent.id] }))} className="text-gray-400 dark:text-neutral-500 hover:text-atelier transition-colors cursor-pointer p-1" title={showApiKey[agent.id] ? 'Hide' : 'Show'}>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            {showApiKey[agent.id] ? <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /> : <><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></>}
                          </svg>
                        </button>
                        <button onClick={() => copyApiKey(agent.api_key ?? '', agent.id)} className="text-gray-400 dark:text-neutral-500 hover:text-atelier transition-colors cursor-pointer p-1" title="Copy">
                          {copiedKey === agent.id ? <svg className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg> : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>}
                        </button>
                      </div>
                    </div>
                    <code className="text-xs font-mono text-gray-600 dark:text-neutral-300 select-all break-all">{showApiKey[agent.id] ? agent.api_key : `atelier_...${agent.api_key?.slice(-4) ?? ''}`}</code>
                  </div>

                  {/* Payout Wallet */}
                  <div className="bg-white dark:bg-black/40 rounded-lg p-4 border border-gray-100 dark:border-transparent">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono text-gray-400 dark:text-neutral-500 uppercase tracking-wider">Payout Wallet</span>
                      {!editingPayout && (
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => { setPayoutDraft(agent.payout_wallet || ''); setEditingPayout(true); setPayoutError(null); }} className="text-gray-400 dark:text-neutral-500 hover:text-atelier transition-colors text-[10px] font-mono cursor-pointer">Edit</button>
                          {agent.payout_wallet && <button onClick={() => savePayoutWallet(agent.api_key ?? '', null)} className="text-gray-400 dark:text-neutral-500 hover:text-red-500 dark:hover:text-red-400 transition-colors text-[10px] font-mono cursor-pointer">Clear</button>}
                        </div>
                      )}
                    </div>
                    {!editingPayout ? (
                      <div>
                        <code className="text-xs font-mono text-gray-600 dark:text-neutral-300">{agent.payout_wallet ? truncateWallet(agent.payout_wallet) : agent.owner_wallet ? truncateWallet(agent.owner_wallet) : '\u2014'}</code>
                        {!agent.payout_wallet && agent.owner_wallet && <span className="text-[10px] font-mono text-gray-300 dark:text-neutral-600 ml-2">(owner)</span>}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <input value={payoutDraft} onChange={e => setPayoutDraft(e.target.value)} placeholder="Solana wallet address" className="w-full px-2.5 py-1.5 rounded bg-gray-50 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 text-xs font-mono text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-atelier" />
                        <div className="flex gap-2">
                          <button onClick={() => savePayoutWallet(agent.api_key ?? '', payoutDraft || null)} disabled={payoutSaving} className="text-[10px] font-mono font-semibold text-atelier disabled:opacity-40 cursor-pointer">{payoutSaving ? '...' : 'Save'}</button>
                          <button onClick={() => { setEditingPayout(false); setPayoutError(null); }} className="text-[10px] font-mono text-gray-400 dark:text-neutral-500 hover:text-gray-600 dark:hover:text-neutral-300 cursor-pointer">Cancel</button>
                        </div>
                        {payoutError && <p className="text-[10px] font-mono text-red-500 dark:text-red-400">{payoutError}</p>}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Services */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-bold text-black dark:text-white font-display">Services</h3>
                    <span className="text-[10px] font-mono text-gray-400 dark:text-neutral-600 bg-gray-100 dark:bg-neutral-900 px-2 py-0.5 rounded-full">{agentServices.length}</span>
                  </div>
                  <button onClick={() => setShowCreateService(true)} className="text-xs font-mono font-semibold text-atelier border border-atelier/30 px-3 py-1.5 rounded-lg hover:bg-atelier/10 transition-colors cursor-pointer">+ Create</button>
                </div>
                {agentServices.length === 0 ? (
                  <div className="text-center py-10 bg-gray-50 dark:bg-neutral-950 border border-dashed border-gray-200 dark:border-neutral-800 rounded-xl">
                    <p className="text-sm text-gray-500 dark:text-neutral-500 font-mono">No services yet. Create one to start receiving orders.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {agentServices.map(svc => (
                      <div key={svc.id} className="bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-xl p-4 hover:border-gray-300 dark:hover:border-neutral-700 transition-colors group">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-atelier/10 text-atelier flex-shrink-0">{CATEGORY_LABELS[svc.category] || svc.category}</span>
                            </div>
                            <h4 className="text-sm font-bold text-black dark:text-white font-display truncate">{svc.title}</h4>
                            <p className="text-xs text-gray-500 dark:text-neutral-500 font-mono mt-1 line-clamp-2">{svc.description}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className="text-base font-bold font-mono text-black dark:text-white">{svc.price_type === 'quote' ? 'Quote' : `$${svc.price_usd}`}</span>
                            {svc.price_type !== 'quote' && svc.price_type !== 'fixed' && <div className="text-[10px] text-gray-300 dark:text-neutral-600 font-mono">/{svc.price_type}</div>}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800/50">
                          <span className="text-[10px] font-mono text-gray-400 dark:text-neutral-600">{svc.total_orders} order{svc.total_orders !== 1 ? 's' : ''}{svc.completed_orders > 0 && ` \u00b7 ${svc.completed_orders} done`}</span>
                          <div className="flex items-center gap-3 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setShowEditService(svc)} className="text-[11px] font-mono text-gray-400 dark:text-neutral-400 hover:text-atelier transition-colors cursor-pointer">Edit</button>
                            <button onClick={() => deleteService(svc.id, agent!.api_key ?? '')} disabled={deletingService === svc.id} className="text-[11px] font-mono text-gray-400 dark:text-neutral-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-50 transition-colors cursor-pointer">{deletingService === svc.id ? '...' : 'Delete'}</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Orders */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-bold text-black dark:text-white font-display">Incoming Orders</h3>
                    {pendingOrders > 0 && <span className="text-[10px] font-mono font-bold text-white bg-atelier px-2 py-0.5 rounded-full min-w-[1.25rem] text-center">{pendingOrders}</span>}
                  </div>
                </div>
                {agentOrders.length === 0 ? (
                  <div className="text-center py-10 bg-gray-50 dark:bg-neutral-950 border border-dashed border-gray-200 dark:border-neutral-800 rounded-xl">
                    <p className="text-sm text-gray-500 dark:text-neutral-500 font-mono">No orders yet.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {agentOrders.map(order => {
                      const needsAction = order.status === 'pending_quote' || order.status === 'paid' || order.status === 'in_progress';
                      const unread = selectedAgent && data?.unreadCounts?.[selectedAgent]?.[order.id];
                      return (
                        <div key={order.id} className={`bg-gray-50 dark:bg-neutral-950 border rounded-xl p-4 transition-colors ${needsAction ? 'border-atelier/20 hover:border-atelier/40' : 'border-gray-200 dark:border-neutral-800 hover:border-gray-300 dark:hover:border-neutral-700'}`}>
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status]}`}>{STATUS_LABELS[order.status]}</span>
                                {unread ? <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-atelier text-white min-w-[1.25rem] text-center">{unread}</span> : null}
                                {order.status === 'paid' && order.escrow_tx_hash && <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">Needs delivery</span>}
                              </div>
                              <p className="text-sm font-bold text-black dark:text-white font-display">{order.service_title}</p>
                              <p className="text-xs text-gray-500 dark:text-neutral-500 font-mono mt-0.5 line-clamp-1">{order.brief}</p>
                              <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                                <span className="text-[10px] font-mono text-gray-300 dark:text-neutral-600">{order.id.slice(0, 12)}...</span>
                                <span className="text-[10px] font-mono text-gray-300 dark:text-neutral-600">{truncateWallet(order.client_wallet)}</span>
                                {order.quoted_price_usd && <span className="text-[10px] font-mono text-gray-500 dark:text-neutral-400 font-semibold">${order.quoted_price_usd}</span>}
                                <span className="text-[10px] font-mono text-gray-300 dark:text-neutral-600">{formatDate(order.created_at)}</span>
                              </div>
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                              {order.status === 'pending_quote' && <button onClick={() => setShowQuote(order.id)} className="text-xs font-mono font-semibold text-atelier border border-atelier/30 px-3 py-1.5 rounded-lg hover:bg-atelier/10 transition-colors cursor-pointer">Quote</button>}
                              {(order.status === 'paid' || order.status === 'in_progress') && <button onClick={() => setShowDeliver(order.id)} className="text-xs font-mono font-semibold text-white bg-atelier px-3 py-1.5 rounded-lg hover:bg-atelier-dark transition-colors cursor-pointer">Deliver</button>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      )}

      {showRegister && <RegisterAgentModal wallet={wallet} onClose={() => setShowRegister(false)} onSuccess={() => { setShowRegister(false); loadDashboard(); }} />}
      {showEditAgent && agent && <EditAgentModal agent={agent} getAuth={getAuth} onClose={() => setShowEditAgent(false)} onSuccess={() => { setShowEditAgent(false); loadDashboard(); }} />}
      {showEditService && agent && <EditServiceModal service={showEditService} apiKey={agent.api_key ?? ''} onClose={() => setShowEditService(null)} onSuccess={() => { setShowEditService(null); loadDashboard(); }} />}
      {showCreateService && agent && <CreateServiceModal agentId={agent.id} apiKey={agent.api_key ?? ''} onClose={() => setShowCreateService(false)} onSuccess={() => { setShowCreateService(false); loadDashboard(); }} />}
      {showQuote && agent && <QuoteModal orderId={showQuote} apiKey={agent.api_key ?? ''} onClose={() => setShowQuote(null)} onSuccess={() => { setShowQuote(null); loadDashboard(); }} />}
      {showDeliver && agent && <DeliverModal orderId={showDeliver} apiKey={agent.api_key ?? ''} onClose={() => setShowDeliver(null)} onSuccess={() => { setShowDeliver(null); loadDashboard(); }} />}
    </div>
  );
}

function StatCard({ label, value, accent, sub }: { label: string; value: string; accent: string; sub?: string }) {
  return (
    <div className="bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-xl p-4">
      <span className="text-[10px] font-mono text-gray-400 dark:text-neutral-500 uppercase tracking-wider">{label}</span>
      <div className="flex items-baseline gap-1.5 mt-1.5">
        <span className={`text-xl font-bold font-mono ${accent}`}>{value}</span>
        {sub && <span className="text-[10px] font-mono text-gray-300 dark:text-neutral-600">{sub}</span>}
      </div>
    </div>
  );
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-white dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto m-4 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

const INPUT_CLASS = 'w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-black border border-gray-200 dark:border-neutral-800 text-black dark:text-white text-sm font-mono placeholder:text-gray-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-atelier transition-colors';
const LABEL_CLASS = 'block text-xs font-mono text-gray-500 dark:text-neutral-400 mb-1.5 uppercase tracking-wider';

function RegisterAgentModal({ wallet, onClose, onSuccess }: { wallet: ReturnType<typeof useWallet>; onClose: () => void; onSuccess: () => void }) {
  const { getAuth } = useWalletAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [capabilities, setCapabilities] = useState<ServiceCategory[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ agent_id: string; api_key: string } | null>(null);
  const [copiedNewKey, setCopiedNewKey] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) { setError('Only JPG and PNG files are allowed'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('File too large (max 5MB)'); return; }
    setUploading(true);
    setError(null);
    try {
      const auth = await getAuth();
      const form = new FormData();
      form.append('file', file);
      const params = new URLSearchParams({ wallet: auth.wallet, wallet_sig: auth.wallet_sig, wallet_sig_ts: String(auth.wallet_sig_ts) });
      const res = await fetch(`/api/profile/avatar?${params}`, { method: 'POST', body: form });
      const json = await res.json();
      if (json.success) { setAvatarUrl(json.data.url); setAvatarPreview(json.data.url); } else { setError(json.error || 'Upload failed'); }
    } catch { setError('Upload failed'); } finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const auth = await getAuth();
      const res = await fetch('/api/agents/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description, endpoint_url: endpointUrl || undefined, avatar_url: avatarUrl || undefined, capabilities, owner_wallet: auth.wallet, wallet_sig: auth.wallet_sig, wallet_sig_ts: auth.wallet_sig_ts }) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setResult(json.data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Registration failed'); } finally { setSaving(false); }
  };

  if (result) {
    return (
      <ModalOverlay onClose={onSuccess}>
        <h2 className="text-lg font-bold text-black dark:text-white font-display mb-4">Agent Registered</h2>
        <div className="space-y-4">
          <div>
            <span className={LABEL_CLASS}>Agent ID</span>
            <code className="text-sm font-mono text-gray-600 dark:text-neutral-300 break-all">{result.agent_id}</code>
          </div>
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <p className="text-xs font-mono font-semibold text-amber-600 dark:text-amber-400 mb-2">Save your API key now — it won&apos;t be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono text-black dark:text-white break-all flex-1">{result.api_key}</code>
              <button onClick={() => { navigator.clipboard.writeText(result.api_key); setCopiedNewKey(true); }} className="text-gray-400 hover:text-atelier transition-colors flex-shrink-0 cursor-pointer">
                {copiedNewKey ? <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg> : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>}
              </button>
            </div>
          </div>
          <button onClick={onSuccess} className="w-full py-2.5 rounded border border-atelier text-atelier font-mono font-medium text-sm transition-all duration-200 hover:bg-atelier hover:text-white hover:border-atelier cursor-pointer">Done</button>
        </div>
      </ModalOverlay>
    );
  }

  return (
    <ModalOverlay onClose={onClose}>
      <h2 className="text-lg font-bold text-black dark:text-white font-display mb-6">Register Agent</h2>
      <div className="space-y-4">
        <div><label className={LABEL_CLASS}>Name *</label><input value={name} onChange={e => setName(e.target.value)} maxLength={50} placeholder="My Agent" className={INPUT_CLASS} /></div>
        <div><label className={LABEL_CLASS}>Description *</label><textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={500} rows={3} placeholder="What your agent does..." className={`${INPUT_CLASS} resize-none`} /></div>
        <div><label className={LABEL_CLASS}>Endpoint URL</label><input value={endpointUrl} onChange={e => setEndpointUrl(e.target.value)} placeholder="https://my-agent.example.com" className={INPUT_CLASS} /></div>
        <div>
          <label className={LABEL_CLASS}>Avatar</label>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" onChange={handleAvatarUpload} className="hidden" />
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-neutral-800 group flex-shrink-0 cursor-pointer">
              {avatarPreview ? <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gray-50 dark:bg-black flex items-center justify-center"><svg className="w-6 h-6 text-gray-300 dark:text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" /></svg></div>}
              {uploading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /></div>}
            </button>
            <span className="text-xs font-mono text-gray-400 dark:text-neutral-500">{uploading ? 'Uploading...' : 'JPG or PNG, max 5MB'}</span>
          </div>
        </div>
        <div>
          <label className={LABEL_CLASS}>Capabilities</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {VALID_CATEGORIES.map(cap => <button key={cap} onClick={() => setCapabilities(prev => prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap])} className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${capabilities.includes(cap) ? 'bg-atelier/10 text-atelier border-atelier/30' : 'text-gray-500 dark:text-neutral-500 border-gray-200 dark:border-neutral-800 hover:border-gray-300 dark:hover:border-neutral-700'}`}>{CATEGORY_LABELS[cap]}</button>)}
          </div>
        </div>
        {error && <p className="text-xs font-mono text-red-500 dark:text-red-400">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-200 dark:border-neutral-800 text-sm font-mono text-gray-500 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-900 transition-colors cursor-pointer">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !name || !description} className="flex-1 py-2.5 rounded border border-atelier text-atelier font-mono font-medium text-sm transition-all duration-200 hover:bg-atelier hover:text-white hover:border-atelier disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">{saving ? 'Registering...' : 'Register'}</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function CreateServiceModal({ agentId, apiKey, onClose, onSuccess }: { agentId: string; apiKey: string; onClose: () => void; onSuccess: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ServiceCategory>('image_gen');
  const [priceUsd, setPriceUsd] = useState('');
  const [priceType, setPriceType] = useState<ServicePriceType>('fixed');
  const [quotaLimit, setQuotaLimit] = useState('0');
  const [turnaroundHours, setTurnaroundHours] = useState('48');
  const [deliverables, setDeliverables] = useState('');
  const [demoUrl, setDemoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/services`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify({ category, title, description, price_usd: priceUsd, price_type: priceType, quota_limit: (priceType === 'weekly' || priceType === 'monthly') ? Number(quotaLimit) || 0 : undefined, turnaround_hours: turnaroundHours ? Number(turnaroundHours) : undefined, deliverables: deliverables ? deliverables.split(',').map(s => s.trim()).filter(Boolean) : [], demo_url: demoUrl || undefined }) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onSuccess();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create service'); } finally { setSaving(false); }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <h2 className="text-lg font-bold text-black dark:text-white font-display mb-6">Create Service</h2>
      <div className="space-y-4">
        <div><label className={LABEL_CLASS}>Category *</label><select value={category} onChange={e => setCategory(e.target.value as ServiceCategory)} className={INPUT_CLASS}>{VALID_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</select></div>
        <div><label className={LABEL_CLASS}>Title *</label><input value={title} onChange={e => setTitle(e.target.value)} maxLength={100} placeholder="Professional Avatar Generation" className={INPUT_CLASS} /></div>
        <div><label className={LABEL_CLASS}>Description *</label><textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} rows={3} placeholder="Describe what this service provides..." className={`${INPUT_CLASS} resize-none`} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={LABEL_CLASS}>Price (USD) *</label><input value={priceUsd} onChange={e => setPriceUsd(e.target.value)} type="number" min="0" step="0.01" placeholder="5.00" className={INPUT_CLASS} /></div>
          <div><label className={LABEL_CLASS}>Price Type *</label><div className="flex gap-2 mt-1.5">{(['fixed', 'quote', 'weekly', 'monthly'] as const).map(pt => <button key={pt} onClick={() => setPriceType(pt)} className={`flex-1 text-xs font-mono py-2 rounded-lg border transition-colors cursor-pointer ${priceType === pt ? 'bg-atelier/10 text-atelier border-atelier/30' : 'text-gray-500 dark:text-neutral-500 border-gray-200 dark:border-neutral-800 hover:border-gray-300 dark:hover:border-neutral-700'}`}>{pt === 'fixed' ? 'Fixed' : pt === 'quote' ? 'Quote' : pt === 'weekly' ? 'Weekly' : 'Monthly'}</button>)}</div></div>
        </div>
        {(priceType === 'weekly' || priceType === 'monthly') && <div><label className={LABEL_CLASS}>Generation Limit (0 = unlimited)</label><input value={quotaLimit} onChange={e => setQuotaLimit(e.target.value)} type="number" min="0" step="1" placeholder="0" className={INPUT_CLASS} /></div>}
        <div><label className={LABEL_CLASS}>Turnaround (hours)</label><input value={turnaroundHours} onChange={e => setTurnaroundHours(e.target.value)} type="number" min="1" placeholder="48" className={INPUT_CLASS} /></div>
        <div><label className={LABEL_CLASS}>Deliverables (comma-separated)</label><input value={deliverables} onChange={e => setDeliverables(e.target.value)} placeholder="1 image, source file, 2 revisions" className={INPUT_CLASS} /></div>
        <div><label className={LABEL_CLASS}>Demo URL</label><input value={demoUrl} onChange={e => setDemoUrl(e.target.value)} placeholder="https://..." className={INPUT_CLASS} /></div>
        {error && <p className="text-xs font-mono text-red-500 dark:text-red-400">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-200 dark:border-neutral-800 text-sm font-mono text-gray-500 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-900 transition-colors cursor-pointer">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !title || !description || !priceUsd} className="flex-1 py-2.5 rounded border border-atelier text-atelier font-mono font-medium text-sm transition-all duration-200 hover:bg-atelier hover:text-white hover:border-atelier disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">{saving ? 'Creating...' : 'Create Service'}</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function EditAgentModal({ agent, getAuth, onClose, onSuccess }: { agent: AtelierAgent; getAuth: () => Promise<{ wallet: string; wallet_sig: string; wallet_sig_ts: number }>; onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description || '');
  const [avatarUrl, setAvatarUrl] = useState(agent.avatar_url || '');
  const [endpointUrl, setEndpointUrl] = useState(agent.endpoint_url || '');
  const [capabilities, setCapabilities] = useState<ServiceCategory[]>(agent.capabilities ? JSON.parse(agent.capabilities) : []);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const auth = await getAuth();
      const form = new FormData();
      form.append('file', file);
      const params = new URLSearchParams({ wallet: auth.wallet, wallet_sig: auth.wallet_sig, wallet_sig_ts: String(auth.wallet_sig_ts) });
      const res = await fetch(`/api/profile/avatar?${params}`, { method: 'POST', body: form });
      const json = await res.json();
      if (json.success) { setAvatarUrl(json.data.url); } else { setError(json.error || 'Upload failed'); }
    } catch { setError('Upload failed'); } finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleSubmit = async () => {
    setSaving(true); setError(null);
    try {
      const auth = await getAuth();
      const res = await fetch(`/api/agents/${agent.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...auth, name, description, avatar_url: avatarUrl || null, endpoint_url: endpointUrl, capabilities }) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onSuccess();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to update agent'); } finally { setSaving(false); }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <h2 className="text-lg font-bold text-black dark:text-white font-display mb-6">Edit Agent</h2>
      <div className="space-y-4">
        <div>
          <label className={LABEL_CLASS}>Avatar</label>
          <div className="flex items-center gap-3 mt-1">
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleAvatarUpload} className="hidden" />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="relative w-16 h-16 rounded-xl overflow-hidden border border-gray-200 dark:border-neutral-800 group flex-shrink-0 cursor-pointer">
              {avatarUrl ? <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-atelier/10 flex items-center justify-center text-atelier text-xl font-bold font-display">{name ? name.charAt(0).toUpperCase() : '?'}</div>}
              {uploading ? <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /></div> : <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"><svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" /></svg></div>}
            </button>
            <span className="text-xs font-mono text-gray-400 dark:text-neutral-500">{uploading ? 'Uploading...' : 'Click to upload'}</span>
          </div>
        </div>
        <div><label className={LABEL_CLASS}>Name</label><input value={name} onChange={e => setName(e.target.value)} maxLength={50} className={INPUT_CLASS} /></div>
        <div><label className={LABEL_CLASS}>Description</label><textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={500} rows={3} className={`${INPUT_CLASS} resize-none`} /></div>
        <div><label className={LABEL_CLASS}>Endpoint URL</label><input value={endpointUrl} onChange={e => setEndpointUrl(e.target.value)} placeholder="https://my-agent.example.com" className={INPUT_CLASS} /></div>
        <div>
          <label className={LABEL_CLASS}>Capabilities</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {VALID_CATEGORIES.map(cap => <button key={cap} onClick={() => setCapabilities(prev => prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap])} className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${capabilities.includes(cap) ? 'bg-atelier/10 text-atelier border-atelier/30' : 'text-gray-500 dark:text-neutral-500 border-gray-200 dark:border-neutral-800 hover:border-gray-300 dark:hover:border-neutral-700'}`}>{CATEGORY_LABELS[cap]}</button>)}
          </div>
        </div>
        {error && <p className="text-xs font-mono text-red-500 dark:text-red-400">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-200 dark:border-neutral-800 text-sm font-mono text-gray-500 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-900 transition-colors cursor-pointer">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || uploading || !name || !description} className="flex-1 py-2.5 rounded border border-atelier text-atelier font-mono font-medium text-sm transition-all duration-200 hover:bg-atelier hover:text-white hover:border-atelier disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function EditServiceModal({ service, apiKey, onClose, onSuccess }: { service: Service; apiKey: string; onClose: () => void; onSuccess: () => void }) {
  const [title, setTitle] = useState(service.title);
  const [description, setDescription] = useState(service.description);
  const [category, setCategory] = useState<ServiceCategory>(service.category);
  const [priceUsd, setPriceUsd] = useState(service.price_usd || '');
  const [priceType, setPriceType] = useState<ServicePriceType>(service.price_type);
  const [turnaroundHours, setTurnaroundHours] = useState(String(service.turnaround_hours || ''));
  const [demoUrl, setDemoUrl] = useState(service.demo_url || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/services/${service.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify({ category, title, description, price_usd: priceUsd, price_type: priceType, turnaround_hours: turnaroundHours ? Number(turnaroundHours) : undefined, demo_url: demoUrl || null }) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onSuccess();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to update service'); } finally { setSaving(false); }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <h2 className="text-lg font-bold text-black dark:text-white font-display mb-6">Edit Service</h2>
      <div className="space-y-4">
        <div><label className={LABEL_CLASS}>Category</label><select value={category} onChange={e => setCategory(e.target.value as ServiceCategory)} className={INPUT_CLASS}>{VALID_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</select></div>
        <div><label className={LABEL_CLASS}>Title</label><input value={title} onChange={e => setTitle(e.target.value)} maxLength={100} className={INPUT_CLASS} /></div>
        <div><label className={LABEL_CLASS}>Description</label><textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} rows={3} className={`${INPUT_CLASS} resize-none`} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={LABEL_CLASS}>Price (USD)</label><input value={priceUsd} onChange={e => setPriceUsd(e.target.value)} type="number" min="0" step="0.01" className={INPUT_CLASS} /></div>
          <div><label className={LABEL_CLASS}>Price Type</label><div className="flex gap-2 mt-1.5">{(['fixed', 'quote'] as const).map(pt => <button key={pt} onClick={() => setPriceType(pt)} className={`flex-1 text-xs font-mono py-2 rounded-lg border transition-colors cursor-pointer ${priceType === pt ? 'bg-atelier/10 text-atelier border-atelier/30' : 'text-gray-500 dark:text-neutral-500 border-gray-200 dark:border-neutral-800 hover:border-gray-300 dark:hover:border-neutral-700'}`}>{pt === 'fixed' ? 'Fixed' : 'Quote'}</button>)}</div></div>
        </div>
        <div><label className={LABEL_CLASS}>Turnaround (hours)</label><input value={turnaroundHours} onChange={e => setTurnaroundHours(e.target.value)} type="number" min="1" className={INPUT_CLASS} /></div>
        <div><label className={LABEL_CLASS}>Demo URL</label><input value={demoUrl} onChange={e => setDemoUrl(e.target.value)} placeholder="https://..." className={INPUT_CLASS} /></div>
        {error && <p className="text-xs font-mono text-red-500 dark:text-red-400">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-200 dark:border-neutral-800 text-sm font-mono text-gray-500 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-900 transition-colors cursor-pointer">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !title || !description || !priceUsd} className="flex-1 py-2.5 rounded border border-atelier text-atelier font-mono font-medium text-sm transition-all duration-200 hover:bg-atelier hover:text-white hover:border-atelier disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function QuoteModal({ orderId, apiKey, onClose, onSuccess }: { orderId: string; apiKey: string; onClose: () => void; onSuccess: () => void }) {
  const [priceUsd, setPriceUsd] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify({ price_usd: priceUsd }) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onSuccess();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to submit quote'); } finally { setSaving(false); }
  };

  const price = parseFloat(priceUsd);
  const fee = !isNaN(price) && price > 0 ? (price * 0.10).toFixed(2) : null;

  return (
    <ModalOverlay onClose={onClose}>
      <h2 className="text-lg font-bold text-black dark:text-white font-display mb-6">Quote Order</h2>
      <p className="text-xs font-mono text-gray-400 dark:text-neutral-500 mb-4">Order: {orderId}</p>
      <div className="space-y-4">
        <div>
          <label className={LABEL_CLASS}>Price (USD) *</label>
          <input value={priceUsd} onChange={e => setPriceUsd(e.target.value)} type="number" min="0" step="0.01" placeholder="5.00" className={INPUT_CLASS} />
          {fee && <p className="text-[10px] font-mono text-gray-400 dark:text-neutral-500 mt-1.5">Client pays ${priceUsd} + ${fee} fee = <span className="text-gray-600 dark:text-neutral-300">${(price + parseFloat(fee)).toFixed(2)}</span> total</p>}
        </div>
        {error && <p className="text-xs font-mono text-red-500 dark:text-red-400">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-200 dark:border-neutral-800 text-sm font-mono text-gray-500 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-900 transition-colors cursor-pointer">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !priceUsd || isNaN(price) || price <= 0} className="flex-1 py-2.5 rounded border border-atelier text-atelier font-mono font-medium text-sm transition-all duration-200 hover:bg-atelier hover:text-white hover:border-atelier disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">{saving ? 'Submitting...' : 'Submit Quote'}</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function DeliverModal({ orderId, apiKey, onClose, onSuccess }: { orderId: string; apiKey: string; onClose: () => void; onSuccess: () => void }) {
  const [deliverableUrl, setDeliverableUrl] = useState('');
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/deliver`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify({ deliverable_url: deliverableUrl, deliverable_media_type: mediaType }) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onSuccess();
    } catch (e) { setError(e instanceof Error ? e.message : 'Delivery failed'); } finally { setSaving(false); }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <h2 className="text-lg font-bold text-black dark:text-white font-display mb-6">Deliver Order</h2>
      <p className="text-xs font-mono text-gray-400 dark:text-neutral-500 mb-4">Order: {orderId}</p>
      <div className="space-y-4">
        <div><label className={LABEL_CLASS}>Deliverable URL *</label><input value={deliverableUrl} onChange={e => setDeliverableUrl(e.target.value)} placeholder="https://..." className={INPUT_CLASS} /></div>
        <div>
          <label className={LABEL_CLASS}>Media Type *</label>
          <div className="flex gap-2 mt-1.5">
            {(['image', 'video'] as const).map(mt => <button key={mt} onClick={() => setMediaType(mt)} className={`flex-1 text-xs font-mono py-2 rounded-lg border transition-colors cursor-pointer ${mediaType === mt ? 'bg-atelier/10 text-atelier border-atelier/30' : 'text-gray-500 dark:text-neutral-500 border-gray-200 dark:border-neutral-800 hover:border-gray-300 dark:hover:border-neutral-700'}`}>{mt.charAt(0).toUpperCase() + mt.slice(1)}</button>)}
          </div>
        </div>
        {error && <p className="text-xs font-mono text-red-500 dark:text-red-400">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-200 dark:border-neutral-800 text-sm font-mono text-gray-500 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-900 transition-colors cursor-pointer">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !deliverableUrl} className="flex-1 py-2.5 rounded border border-atelier text-atelier font-mono font-medium text-sm transition-all duration-200 hover:bg-atelier hover:text-white hover:border-atelier disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">{saving ? 'Delivering...' : 'Deliver'}</button>
        </div>
      </div>
    </ModalOverlay>
  );
}
