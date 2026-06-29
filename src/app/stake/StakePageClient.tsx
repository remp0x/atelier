'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  getAccount,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { STAKING_TIERS, STAKED_MINT, projectAccRewardPerWeight } from '@/lib/staking-config';
import { fetchPool, fetchPosition, type StakePositionAccount, type StakePoolAccount } from '@/lib/staking-program';
import { StakeDashboard } from '@/components/atelier/stake/StakeDashboard';
import { StakePanel } from '@/components/atelier/stake/StakePanel';
import { PositionCard } from '@/components/atelier/stake/PositionCard';
import { HowItWorks } from '@/components/atelier/stake/HowItWorks';
import type { StakingStatsData } from '@/components/atelier/stake/types';

const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

const AUTO_REFRESH_MS = 60_000;

interface StatsApiResponse {
  success: boolean;
  data?: StakingStatsData;
  error?: string;
}

export function StakePageClient() {
  const { authenticated, ready, login, solanaAddress } = useAtelierAuth();

  const [stats, setStats] = useState<StakingStatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [pool, setPool] = useState<StakePoolAccount | null>(null);
  const [positions, setPositions] = useState<(StakePositionAccount | null)[]>([null, null, null]);
  const [chainLoading, setChainLoading] = useState(false);

  const [atelierBalance, setAtelierBalance] = useState<bigint>(0n);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const fetchStats = useCallback(async (silent = false) => {
    if (!silent) setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await fetch('/api/staking/stats');
      const json = (await res.json()) as StatsApiResponse;
      if (json.success && json.data) {
        setStats(json.data);
      } else {
        setStatsError(json.error ?? 'Failed to load staking stats');
      }
    } catch {
      setStatsError('Failed to load staking stats');
    } finally {
      if (!silent) setStatsLoading(false);
    }
  }, []);

  const fetchChainData = useCallback(async () => {
    if (!solanaAddress) return;
    setChainLoading(true);
    try {
      const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
      const owner = new PublicKey(solanaAddress);

      const [poolAccount, ...posAccounts] = await Promise.all([
        fetchPool(connection),
        ...STAKING_TIERS.map((t) => fetchPosition(connection, owner, t.index)),
      ]);

      setPool(poolAccount);
      setPositions(posAccounts);
    } catch {
      // non-fatal; positions remain null (show empty state)
    } finally {
      setChainLoading(false);
    }
  }, [solanaAddress]);

  const fetchAtelierBalance = useCallback(async () => {
    if (!solanaAddress) {
      setAtelierBalance(0n);
      return;
    }
    setBalanceLoading(true);
    try {
      const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
      const owner = new PublicKey(solanaAddress);
      const ata = getAssociatedTokenAddressSync(STAKED_MINT, owner, false, TOKEN_2022_PROGRAM_ID);
      const account = await getAccount(connection, ata, 'confirmed', TOKEN_2022_PROGRAM_ID);
      setAtelierBalance(account.amount);
    } catch {
      setAtelierBalance(0n);
    } finally {
      setBalanceLoading(false);
    }
  }, [solanaAddress]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchChainData(), fetchAtelierBalance()]);
    await fetchStats(true);
  }, [fetchChainData, fetchAtelierBalance, fetchStats]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (!solanaAddress) return;
    void fetchChainData();
    void fetchAtelierBalance();
  }, [solanaAddress, fetchChainData, fetchAtelierBalance]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void fetchStats(true);
      if (solanaAddress) {
        void fetchChainData();
        void fetchAtelierBalance();
      }
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchStats, fetchChainData, fetchAtelierBalance, solanaAddress]);

  if (!ready || statsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-5 h-5 rounded-full border-2 border-atelier/30 border-t-atelier animate-spin" />
      </div>
    );
  }

  if (statsError) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="font-mono text-[13px] text-red-500 mb-4">{statsError}</p>
        <button
          type="button"
          onClick={() => void fetchStats()}
          className="font-mono text-[11px] text-atelier border border-atelier/30 px-4 py-2 rounded-lg hover:bg-atelier/10 transition-colors cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!stats) return null;

  const accRewardPerWeight = pool
    ? projectAccRewardPerWeight(pool, Date.now() / 1000)
    : 0n;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page header */}
      <div className="px-4 py-6 md:px-8 md:py-8 border-b border-gray-100 dark:border-neutral-900">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center gap-2 mb-1">
            <h1 className="font-display font-bold text-[22px] md:text-[26px] text-black dark:text-white">
              Stake $ATELIER
            </h1>
            {stats.paused && (
              <span className="font-mono text-[10px] font-semibold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                PAUSED
              </span>
            )}
          </div>
          <p className="font-mono text-[12px] text-gray-500 dark:text-neutral-500 max-w-xl leading-relaxed">
            Lock $ATELIER to earn a share of Atelier&apos;s USDC platform revenue. Longer locks earn
            higher multipliers.
          </p>
        </motion.div>
      </div>

      <div className="px-4 py-6 md:px-8 space-y-8">
        {/* Not yet initialized */}
        {!stats.initialized ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="flex flex-col items-center gap-4 rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] px-6 py-16 text-center"
          >
            <div className="w-12 h-12 rounded-full border border-atelier/20 bg-atelier/5 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-atelier"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <div>
              <p className="font-display font-semibold text-[16px] text-black dark:text-white mb-1">
                Staking launching soon
              </p>
              <p className="font-mono text-[12px] text-gray-500 dark:text-neutral-500 max-w-sm leading-relaxed">
                The staking program is not yet deployed on-chain. Check back soon to stake $ATELIER
                and earn real USDC yield.
              </p>
            </div>
            <HowItWorks />
          </motion.div>
        ) : (
          <>
            {/* Dashboard */}
            <section>
              <StakeDashboard stats={stats} />
            </section>

            {/* Stake + Positions side-by-side on wide screens */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Stake panel */}
              <div>
                {authenticated && solanaAddress ? (
                  <motion.div
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35 }}
                  >
                    <StakePanel
                      solanaAddress={solanaAddress}
                      atelierBalance={atelierBalance}
                      balanceLoading={balanceLoading || chainLoading}
                      stats={stats}
                      onSuccess={() => void refreshAll()}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35 }}
                    className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] p-6 flex flex-col items-center gap-4 text-center"
                  >
                    <p className="font-mono text-[12px] text-gray-500 dark:text-neutral-500">
                      Connect to stake $ATELIER and earn USDC rewards.
                    </p>
                    <button
                      type="button"
                      onClick={login}
                      className="inline-flex items-center justify-center h-10 px-6 rounded-lg font-mono text-[12px] font-medium bg-atelier text-white hover:bg-atelier-bright transition-colors cursor-pointer"
                    >
                      Connect
                    </button>
                  </motion.div>
                )}
              </div>

              {/* Your positions */}
              {authenticated && solanaAddress && (
                <motion.div
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35 }}
                  className="space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-neutral-600">
                      Your positions
                    </p>
                    {chainLoading && (
                      <div className="w-3.5 h-3.5 rounded-full border border-atelier/30 border-t-atelier animate-spin" />
                    )}
                  </div>
                  {STAKING_TIERS.map((tier, i) => (
                    <PositionCard
                      key={tier.index}
                      tier={tier}
                      position={positions[i] ?? null}
                      accRewardPerWeight={accRewardPerWeight}
                      solanaAddress={solanaAddress}
                      atelierDecimals={stats.atelierDecimals}
                      index={i}
                      onRefresh={() => void refreshAll()}
                    />
                  ))}
                </motion.div>
              )}
            </div>

            {/* How it works */}
            <section className="pt-2">
              <HowItWorks />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
