'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getPrivyAccessToken } from '@/lib/privy-client';
import type { AgentDefiAgent, AgentDefiStatus } from './types';
import { formatSol, formatUsd } from './types';

interface AgentDefiPanelProps {
  agents: AgentDefiAgent[];
}

type PanelState =
  | { kind: 'loading' }
  | { kind: 'connecting' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; data: AgentDefiStatus };

interface PolicyDraft {
  enabled: boolean;
  strategy: 'conservative' | 'balanced' | 'aggressive';
  riskPct: number;
  useFullBalance: boolean;
  budgetInput: string;
}

function draftFromStatus(s: AgentDefiStatus): PolicyDraft {
  return {
    enabled: s.policy.enabled,
    strategy: s.policy.strategy,
    riskPct: s.policy.riskPct,
    useFullBalance: s.policy.budgetSol === null,
    budgetInput: s.policy.budgetSol !== null ? String(s.policy.budgetSol) : '',
  };
}

function formatTs(ts: string): string {
  try {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return ts;
  }
}

function pnlColorClass(v: number | null): string {
  if (v === null) return 'text-gray-400 dark:text-neutral-500';
  return v >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
}

function pnlDisplay(v: number | null): string {
  if (v === null) return '—';
  return `${v >= 0 ? '+' : ''}${formatSol(v)} SOL`;
}

function AgentAvatar({ agent }: { agent: AgentDefiAgent }) {
  if (agent.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={agent.avatar_url}
        alt={agent.name}
        className="w-8 h-8 rounded-full object-cover border border-gray-200 dark:border-neutral-800 shrink-0"
      />
    );
  }
  return (
    <div className="w-8 h-8 rounded-full bg-atelier/10 border border-atelier/20 flex items-center justify-center shrink-0">
      <span className="font-mono text-[11px] font-semibold text-atelier select-none">
        {agent.name.slice(0, 1).toUpperCase()}
      </span>
    </div>
  );
}

export function AgentDefiPanel({ agents }: AgentDefiPanelProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const selectedAgent = agents[selectedIdx] ?? agents[0];

  const [status, setStatus] = useState<PanelState>({ kind: 'loading' });
  const [draft, setDraft] = useState<PolicyDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const [fundOpen, setFundOpen] = useState(false);
  const [fundTab, setFundTab] = useState<'fund' | 'withdraw'>('fund');
  const [fundAsset, setFundAsset] = useState<'SOL' | 'USDC'>('SOL');
  const [fundInput, setFundInput] = useState('');
  const [fundSubmitting, setFundSubmitting] = useState(false);
  const [fundMessage, setFundMessage] = useState<string | null>(null);

  const fetchStatus = useCallback(async (agentId: string) => {
    setStatus({ kind: 'loading' });
    try {
      const token = await getPrivyAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/earn/agent-defi/${agentId}/status`, { headers });
      if (res.status === 503) {
        setStatus({ kind: 'connecting' });
        return;
      }
      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const j = await res.json() as { error?: string };
          if (j.error) message = j.error;
        } catch { /* ignore parse error */ }
        setStatus({ kind: 'error', message });
        return;
      }
      const j = await res.json() as { success: boolean; data?: AgentDefiStatus; error?: string };
      if (!j.success || !j.data) {
        setStatus({ kind: 'error', message: j.error ?? 'Failed to load status' });
        return;
      }
      setStatus({ kind: 'ok', data: j.data });
      setDraft(draftFromStatus(j.data));
    } catch {
      setStatus({ kind: 'error', message: 'Failed to connect' });
    }
  }, []);

  const agentId = selectedAgent?.agent_id ?? '';
  useEffect(() => {
    if (!agentId) return;
    void fetchStatus(agentId);
    setDraft(null);
    setFundOpen(false);
    setFundMessage(null);
  }, [agentId, fetchStatus]);

  const savePolicy = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const token = await getPrivyAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const budgetSol = draft.useFullBalance ? null : (parseFloat(draft.budgetInput) || null);
      const res = await fetch(`/api/earn/agent-defi/${agentId}/policy`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          enabled: draft.enabled,
          strategy: draft.strategy,
          riskPct: draft.riskPct,
          budgetSol,
        }),
      });
      if (res.status === 503) { setStatus({ kind: 'connecting' }); return; }
      if (!res.ok) return;
      const j = await res.json() as { success: boolean; data?: AgentDefiStatus };
      if (j.success && j.data) {
        setStatus({ kind: 'ok', data: j.data });
        setDraft(draftFromStatus(j.data));
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2000);
      }
    } catch { /* non-fatal */ } finally {
      setSaving(false);
    }
  }, [agentId, draft]);

  const submitFund = useCallback(async () => {
    if (!fundInput) return;
    const amount = parseFloat(fundInput);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setFundSubmitting(true);
    setFundMessage(null);
    try {
      const token = await getPrivyAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const endpoint = fundTab === 'fund' ? 'fund' : 'withdraw';
      const res = await fetch(`/api/earn/agent-defi/${agentId}/${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ asset: fundAsset, amount }),
      });
      if (res.status === 503) { setStatus({ kind: 'connecting' }); return; }
      if (!res.ok) {
        try {
          const j = await res.json() as { error?: string };
          setFundMessage(j.error ?? 'Failed');
        } catch { setFundMessage('Failed'); }
        return;
      }
      const j = await res.json() as { success: boolean; data?: { txHash: string; newBalance: { sol: number; usdc: number } } };
      if (j.success && j.data) {
        setFundMessage(fundTab === 'fund' ? 'Funded.' : 'Withdrawn.');
        const newBalance = j.data.newBalance;
        setStatus((prev) =>
          prev.kind === 'ok'
            ? { ...prev, data: { ...prev.data, wallet: newBalance } }
            : prev,
        );
        setFundInput('');
        setTimeout(() => setFundMessage(null), 3000);
      }
    } catch { setFundMessage('Failed to connect.'); } finally {
      setFundSubmitting(false);
    }
  }, [agentId, fundTab, fundAsset, fundInput]);

  if (!selectedAgent) return null;

  const isConnecting = status.kind === 'connecting';
  const isLoading = status.kind === 'loading';
  const isError = status.kind === 'error';
  const statusData = status.kind === 'ok' ? status.data : null;
  const controlsDisabled = isConnecting || isLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] px-5 py-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-neutral-800 animate-pulse shrink-0" />
            <div className="space-y-1.5">
              <div className="h-4 w-32 rounded bg-gray-200 dark:bg-neutral-800 animate-pulse" />
              <div className="h-3 w-16 rounded bg-gray-100 dark:bg-neutral-800/60 animate-pulse" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] px-5 py-5">
          <div className="space-y-3">
            <div className="h-3 w-28 rounded bg-gray-100 dark:bg-neutral-800/60 animate-pulse" />
            <div className="h-8 w-full rounded bg-gray-200 dark:bg-neutral-800 animate-pulse" />
            <div className="h-8 w-full rounded bg-gray-200 dark:bg-neutral-800 animate-pulse" />
            <div className="h-1.5 w-full rounded bg-gray-100 dark:bg-neutral-800/60 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {agents.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {agents.map((agent, i) => (
            <button
              key={agent.agent_id}
              type="button"
              onClick={() => setSelectedIdx(i)}
              className={`inline-flex items-center gap-2 h-9 px-3 rounded-xl border font-mono text-[12px] transition-colors cursor-pointer ${
                i === selectedIdx
                  ? 'border-atelier/50 bg-atelier/10 text-atelier'
                  : 'border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-400 hover:border-atelier/30 hover:text-atelier/80'
              }`}
            >
              <AgentAvatar agent={agent} />
              <span>{agent.name}</span>
              {agent.token_symbol && (
                <span className="text-[10px] text-gray-400 dark:text-neutral-600">${agent.token_symbol}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] px-5 py-5"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AgentAvatar agent={selectedAgent} />
            <div>
              <p className="font-display font-bold text-[16px] text-black dark:text-white leading-tight">
                {selectedAgent.name}
              </p>
              {selectedAgent.token_symbol && (
                <p className="font-mono text-[11px] text-gray-400 dark:text-neutral-500">
                  ${selectedAgent.token_symbol}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isConnecting ? (
              <span className="inline-flex items-center gap-1.5 h-5 px-2 rounded-full bg-amber-500/10 border border-amber-500/20 font-mono text-[9px] text-amber-500 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                Connecting
              </span>
            ) : statusData ? (
              <span
                className={`inline-flex items-center gap-1.5 h-5 px-2 rounded-full border font-mono text-[9px] shrink-0 ${
                  statusData.policy.enabled
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                    : 'bg-gray-100 dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-400'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    statusData.policy.enabled ? 'bg-emerald-500' : 'bg-gray-400 dark:bg-neutral-600'
                  }`}
                />
                {statusData.policy.enabled ? 'Automation on' : 'Paused'}
              </span>
            ) : null}
            <a
              href="https://clawpump.tech"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[10px] text-gray-400 dark:text-neutral-500 hover:text-atelier transition-colors"
            >
              ClawPump
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          </div>
        </div>
      </motion.div>

      {isConnecting && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-4"
        >
          <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
          </svg>
          <div>
            <p className="font-mono text-[12px] font-medium text-amber-600 dark:text-amber-400 mb-0.5">
              Autonomous trading is being connected
            </p>
            <p className="font-mono text-[11px] text-gray-500 dark:text-neutral-400 leading-relaxed">
              Infrastructure for {selectedAgent.name} is being wired to ClawPump. Controls will activate once the connection is established.
            </p>
          </div>
        </motion.div>
      )}

      {isError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
          <p className="font-mono text-[11px] text-red-500">{status.message}</p>
          <button
            type="button"
            onClick={() => void fetchStatus(agentId)}
            className="font-mono text-[11px] text-atelier hover:underline cursor-pointer shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className={`rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] px-5 py-5 transition-opacity ${isConnecting ? 'opacity-60' : ''}`}
      >
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gray-400 dark:text-neutral-600 mb-4">
          Automation settings
        </p>
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[13px] text-black dark:text-white font-medium">Enable automation</p>
              <p className="font-mono text-[11px] text-gray-400 dark:text-neutral-500 mt-0.5">
                Allow the agent to trade autonomously within your policy
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draft?.enabled ?? false}
              disabled={controlsDisabled}
              onClick={() => setDraft((d) => d ? { ...d, enabled: !d.enabled } : d)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier/60 disabled:cursor-not-allowed ${(draft?.enabled ?? false) ? 'bg-atelier' : 'bg-gray-200 dark:bg-neutral-700'}`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${(draft?.enabled ?? false) ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>

          <div>
            <p className="font-mono text-[11px] text-gray-400 dark:text-neutral-500 mb-2">Strategy</p>
            <div className="flex gap-2">
              {(['conservative', 'balanced', 'aggressive'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={controlsDisabled}
                  onClick={() => setDraft((d) => d ? { ...d, strategy: s } : d)}
                  className={`flex-1 h-9 rounded-lg font-mono text-[11px] border transition-colors cursor-pointer disabled:cursor-not-allowed capitalize ${
                    draft?.strategy === s
                      ? 'border-atelier/50 bg-atelier/10 text-atelier'
                      : 'border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-400 hover:border-atelier/30 hover:text-atelier/70'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="font-mono text-[11px] text-gray-400 dark:text-neutral-500">Risk cap per trade</p>
              <p className="font-mono text-[12px] font-semibold tabular-nums text-black dark:text-white">
                {draft?.riskPct ?? 0}%
              </p>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={draft?.riskPct ?? 0}
              disabled={controlsDisabled}
              onChange={(e) => setDraft((d) => d ? { ...d, riskPct: Number(e.target.value) } : d)}
              className="w-full h-1.5 rounded-full accent-atelier disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            />
            <div className="flex justify-between mt-1">
              <span className="font-mono text-[9px] text-gray-400 dark:text-neutral-600">0%</span>
              <span className="font-mono text-[9px] text-gray-400 dark:text-neutral-600">100%</span>
            </div>
          </div>

          <div>
            <p className="font-mono text-[11px] text-gray-400 dark:text-neutral-500 mb-2">Max budget</p>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  placeholder="0.00"
                  min={0}
                  step={0.01}
                  value={draft?.useFullBalance ? '' : (draft?.budgetInput ?? '')}
                  disabled={controlsDisabled || (draft?.useFullBalance ?? false)}
                  onChange={(e) => setDraft((d) => d ? { ...d, budgetInput: e.target.value } : d)}
                  className="w-full h-9 pl-3 pr-12 rounded-lg border border-gray-200 dark:border-neutral-800 bg-transparent font-mono text-[12px] text-black dark:text-white placeholder:text-gray-300 dark:placeholder:text-neutral-700 focus:outline-none focus:border-atelier/50 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-gray-400 dark:text-neutral-600 pointer-events-none">
                  SOL
                </span>
              </div>
              <label className="inline-flex items-center gap-1.5 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={draft?.useFullBalance ?? false}
                  disabled={controlsDisabled}
                  onChange={(e) => setDraft((d) => d ? { ...d, useFullBalance: e.target.checked, budgetInput: '' } : d)}
                  className="w-3.5 h-3.5 rounded border-gray-300 dark:border-neutral-700 accent-atelier disabled:cursor-not-allowed"
                />
                <span className="font-mono text-[11px] text-gray-500 dark:text-neutral-400">Full balance</span>
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              disabled={controlsDisabled || saving || !draft}
              onClick={() => void savePolicy()}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg font-mono text-[12px] font-medium border border-atelier/40 text-atelier hover:bg-atelier hover:text-white hover:border-atelier focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/60 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save policy'}
            </button>
            <AnimatePresence>
              {savedFlash && (
                <motion.span
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="font-mono text-[11px] text-emerald-500 dark:text-emerald-400"
                >
                  Saved
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {statusData && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] px-5 py-5"
        >
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gray-400 dark:text-neutral-600 mb-4">
            Live status
          </p>
          <div className="space-y-5">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-600 mb-2">
                Wallet
              </p>
              <div className="flex items-center gap-5">
                <div>
                  <p className="font-mono text-[9px] text-gray-400 dark:text-neutral-600 mb-0.5">SOL</p>
                  <p className="font-mono text-[17px] font-semibold tabular-nums text-black dark:text-white">
                    {formatSol(statusData.wallet.sol)}
                  </p>
                </div>
                <div className="w-px h-8 bg-gray-200 dark:bg-neutral-800 shrink-0" />
                <div>
                  <p className="font-mono text-[9px] text-gray-400 dark:text-neutral-600 mb-0.5">USDC</p>
                  <p className="font-mono text-[17px] font-semibold tabular-nums text-black dark:text-white">
                    ${formatUsd(statusData.wallet.usdc)}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-600 mb-2">
                PnL
              </p>
              <div className="flex items-center gap-6">
                <div>
                  <p className="font-mono text-[9px] text-gray-400 dark:text-neutral-600 mb-0.5">24h</p>
                  <p className={`font-mono text-[15px] font-semibold tabular-nums ${pnlColorClass(statusData.pnl24hSol)}`}>
                    {pnlDisplay(statusData.pnl24hSol)}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[9px] text-gray-400 dark:text-neutral-600 mb-0.5">Total</p>
                  <p className={`font-mono text-[15px] font-semibold tabular-nums ${pnlColorClass(statusData.pnlTotalSol)}`}>
                    {pnlDisplay(statusData.pnlTotalSol)}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-600 mb-2">
                Open positions
              </p>
              {statusData.positions.length === 0 ? (
                <p className="font-mono text-[11px] text-gray-400 dark:text-neutral-600">No open positions</p>
              ) : (
                <div className="space-y-1.5">
                  {statusData.positions.map((pos, i) => (
                    <div key={`${pos.symbol}-${i}`} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-black dark:text-white">{pos.symbol}</span>
                        <span className="font-mono text-[10px] tabular-nums text-gray-400 dark:text-neutral-500">
                          {pos.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] tabular-nums text-gray-500 dark:text-neutral-400">
                        {pos.valueSol !== null ? `${formatSol(pos.valueSol)} SOL` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {statusData.activity.length > 0 && (
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-600 mb-2">
                  Recent activity
                </p>
                <div className="space-y-2.5">
                  {statusData.activity.slice(0, 8).map((item, i) => (
                    <div key={i} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] text-black dark:text-white leading-snug truncate">
                          {item.summary}
                        </p>
                        <p className="font-mono text-[9px] text-gray-400 dark:text-neutral-600 mt-0.5">
                          {formatTs(item.ts)}
                        </p>
                      </div>
                      {item.txHash && (
                        <a
                          href={`https://solscan.io/tx/${item.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 font-mono text-[9px] text-atelier hover:underline shrink-0"
                        >
                          Tx
                          <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className={`rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] overflow-hidden transition-opacity ${isConnecting ? 'opacity-60' : ''}`}
      >
        <button
          type="button"
          onClick={() => { if (!controlsDisabled) setFundOpen((v) => !v); }}
          aria-expanded={fundOpen}
          className="w-full flex items-center justify-between px-5 py-4 text-left cursor-pointer"
        >
          <span className="font-mono text-[12px] font-medium text-black dark:text-white">Manage funds</span>
          <svg
            className={`w-4 h-4 text-gray-400 dark:text-neutral-600 transition-transform duration-200 ${fundOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        <AnimatePresence initial={false}>
          {fundOpen && (
            <motion.div
              key="fund-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}
            >
              <div className="border-t border-gray-200 dark:border-neutral-800/60 px-5 py-5 space-y-4">
                <div className="flex gap-1 p-1 rounded-lg bg-gray-100 dark:bg-neutral-900 w-fit">
                  {(['fund', 'withdraw'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => { setFundTab(tab); setFundMessage(null); }}
                      className={`h-7 px-4 rounded-md font-mono text-[11px] transition-colors capitalize cursor-pointer ${
                        fundTab === tab
                          ? 'bg-white dark:bg-neutral-800 text-black dark:text-white shadow-sm'
                          : 'text-gray-500 dark:text-neutral-400'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <div className="flex gap-1 p-1 rounded-lg bg-gray-100 dark:bg-neutral-900 shrink-0">
                    {(['SOL', 'USDC'] as const).map((asset) => (
                      <button
                        key={asset}
                        type="button"
                        onClick={() => setFundAsset(asset)}
                        className={`h-7 px-3 rounded-md font-mono text-[11px] transition-colors cursor-pointer ${
                          fundAsset === asset
                            ? 'bg-white dark:bg-neutral-800 text-black dark:text-white shadow-sm'
                            : 'text-gray-500 dark:text-neutral-400'
                        }`}
                      >
                        {asset}
                      </button>
                    ))}
                  </div>
                  <div className="relative flex-1">
                    <input
                      type="number"
                      placeholder="0.00"
                      min={0}
                      step={0.01}
                      value={fundInput}
                      onChange={(e) => setFundInput(e.target.value)}
                      className="w-full h-9 pl-3 pr-14 rounded-lg border border-gray-200 dark:border-neutral-800 bg-transparent font-mono text-[12px] text-black dark:text-white placeholder:text-gray-300 dark:placeholder:text-neutral-700 focus:outline-none focus:border-atelier/50"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-gray-400 dark:text-neutral-600 pointer-events-none">
                      {fundAsset}
                    </span>
                  </div>
                </div>

                {fundMessage && (
                  <p
                    className={`font-mono text-[11px] ${
                      fundMessage.toLowerCase().includes('fail') || fundMessage.toLowerCase().includes('error')
                        ? 'text-red-500'
                        : 'text-emerald-500 dark:text-emerald-400'
                    }`}
                  >
                    {fundMessage}
                  </p>
                )}

                <button
                  type="button"
                  disabled={fundSubmitting || !fundInput}
                  onClick={() => void submitFund()}
                  className="inline-flex items-center gap-2 h-9 px-5 rounded-lg font-mono text-[12px] font-medium border border-atelier/40 text-atelier hover:bg-atelier hover:text-white hover:border-atelier focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/60 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed capitalize"
                >
                  {fundSubmitting ? 'Processing...' : fundTab}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
