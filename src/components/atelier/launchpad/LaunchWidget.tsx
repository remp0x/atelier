'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { AgentAvatar } from '@/components/atelier/AgentAvatar';
import { TokenLaunchSection } from '@/components/atelier/TokenLaunchSection';
import { atelierHref } from '@/lib/atelier-paths';
import { getPrivyAccessToken } from '@/lib/privy-client';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import type { AtelierAgent } from '@/lib/atelier-db';

interface DashboardData {
  agents: AtelierAgent[];
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-6 h-6 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function LaunchWidget() {
  const { walletAddress, authenticated, ready, getAuth, login, authMode, user } = useAtelierAuth();

  const [agents, setAgents] = useState<AtelierAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let res: Response;
      if (user?.id) {
        const token = await getPrivyAccessToken();
        if (!token) {
          setLoading(false);
          return;
        }
        res = await fetch('/api/dashboard', { headers: { Authorization: `Bearer ${token}` } });
      } else if (walletAddress) {
        const auth = await getAuth();
        res = await fetch('/api/dashboard', {
          headers: {
            'x-atelier-wallet': auth.wallet,
            'x-atelier-wallet-sig': auth.wallet_sig,
            'x-atelier-wallet-sig-ts': String(auth.wallet_sig_ts),
          },
        });
      } else {
        setLoading(false);
        return;
      }
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      const data: DashboardData = json.data;
      setAgents(data.agents);
      const eligible = data.agents.filter((a) => !a.token_mint);
      if (eligible.length > 0) setSelectedAgentId(eligible[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, [authMode, walletAddress, getAuth, user?.id]);

  useEffect(() => {
    if (authMode === 'wallet') {
      loadAgents();
    } else if (authMode === 'privy' && user?.id) {
      loadAgents();
    } else if (ready && !authenticated) {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authMode, walletAddress, authenticated, ready, user?.id]);

  if (!ready || loading) return <Spinner />;

  if (!authMode) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-black-soft p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-atelier/10 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-atelier" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
          </svg>
        </div>
        <p className="text-sm font-display font-semibold text-black dark:text-white mb-1.5">
          Sign in to launch a token
        </p>
        <p className="text-xs font-mono text-gray-500 dark:text-neutral-400 mb-5">
          Connect your account to see your agents and launch a token.
        </p>
        <button
          onClick={login}
          className="px-6 py-2.5 rounded-lg text-sm font-mono font-semibold text-white transition-all"
          style={{ background: 'linear-gradient(135deg, #fa4c14 0%, #ff7a3d 100%)' }}
        >
          Sign In
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-black-soft p-6 text-center">
        <p className="text-sm font-mono text-red-500 dark:text-red-400 mb-3">{error}</p>
        <button onClick={loadAgents} className="text-sm font-mono text-atelier hover:underline">
          Retry
        </button>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-950 p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-atelier/10 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-atelier" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
        </div>
        <p className="text-sm font-display font-semibold text-black dark:text-white mb-1.5">
          No agents yet
        </p>
        <p className="text-xs font-mono text-gray-500 dark:text-neutral-400 mb-5">
          Register your first agent to launch a token for it.
        </p>
        <Link
          href={atelierHref('/atelier/agents/register')}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-mono font-semibold text-white transition-all"
          style={{ background: 'linear-gradient(135deg, #fa4c14 0%, #ff7a3d 100%)' }}
        >
          Register an Agent
        </Link>
      </div>
    );
  }

  const untokenizedAgents = agents.filter((a) => !a.token_mint);
  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  if (untokenizedAgents.length === 0) {
    return (
      <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-6 text-center">
        <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <p className="text-sm font-display font-semibold text-black dark:text-white mb-1.5">
          All your agents are tokenized
        </p>
        <p className="text-xs font-mono text-gray-500 dark:text-neutral-400 mb-4">
          Every agent you own already has a token. See how they rank below.
        </p>
        <a href="#leaderboard" className="text-xs font-mono text-atelier hover:text-atelier-bright transition-colors">
          View leaderboard below
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {untokenizedAgents.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {untokenizedAgents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setSelectedAgentId(agent.id)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-mono whitespace-nowrap transition-all cursor-pointer ${
                selectedAgentId === agent.id
                  ? 'bg-atelier/10 text-atelier border border-atelier/30 shadow-[0_0_12px_rgba(250,76,20,0.1)]'
                  : 'bg-gray-50 dark:bg-neutral-950 text-gray-500 dark:text-neutral-400 border border-gray-200 dark:border-neutral-800 hover:border-gray-300 dark:hover:border-neutral-700 hover:text-gray-700 dark:hover:text-neutral-300'
              }`}
            >
              <AgentAvatar name={agent.name} seed={agent.id} src={agent.avatar_url} className="w-5 h-5 rounded-full" />
              {agent.name}
            </button>
          ))}
        </div>
      )}

      {selectedAgent && (
        <TokenLaunchSection
          agentId={selectedAgent.id}
          agentName={selectedAgent.name}
          agentDescription={selectedAgent.description ?? undefined}
          agentAvatarUrl={selectedAgent.avatar_url}
          token={null}
          ownerWallet={selectedAgent.owner_wallet}
          onTokenSet={loadAgents}
        />
      )}
    </div>
  );
}
