'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import type { StakingTier } from '@/lib/staking-config';
import { buildUnstakeIx, buildClaimIx, ensureRewardAtaIx, unwrapRewardIx } from '@/lib/staking-program';
import type { StakePositionAccount } from '@/lib/staking-program';
import { computeClaimable } from '@/lib/staking-config';
import { StatusBanner } from '@/components/atelier/earn/StatusBanner';
import {
  formatTokenAmount,
  formatSol,
  formatLockCountdown,
  isUnlocked,
} from './types';
import { useStakeTxSender, type StakeWalletMode } from './useStakeTxSender';

const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

interface Props {
  tier: StakingTier;
  position: StakePositionAccount | null;
  accRewardPerWeight: bigint;
  solanaAddress: string;
  walletMode: StakeWalletMode;
  atelierDecimals: number;
  index: number;
  onRefresh: () => void;
}

type TxAction = 'unstake' | 'claim' | null;

async function confirmTx(connection: Connection, sig: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const { value } = await connection.getSignatureStatuses([sig]);
    const status = value[0];
    if (status) {
      if (status.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
      if (
        status.confirmationStatus === 'confirmed' ||
        status.confirmationStatus === 'finalized'
      ) {
        return;
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 1500));
  }
  // Timed out without a confirmed/finalized status: do not report success.
  throw new Error('Transaction not confirmed in time. Check your wallet before retrying.');
}

export function PositionCard({
  tier,
  position,
  accRewardPerWeight,
  solanaAddress,
  walletMode,
  atelierDecimals,
  index,
  onRefresh,
}: Props) {
  const sendStakeTx = useStakeTxSender(walletMode, solanaAddress);

  const [pending, setPending] = useState<TxAction>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const claimable =
    position !== null
      ? computeClaimable({
          weight: position.weight,
          rewardDebt: position.rewardDebt,
          pendingReward: position.pendingReward,
          accRewardPerWeight,
        })
      : 0n;

  const unlocked = position ? isUnlocked(position.lockUntil) : true;
  const hasStake = position !== null && position.amount > 0n;

  const handleUnstake = useCallback(async () => {
    if (!hasStake || !unlocked || !position) return;
    setErrorMsg(null);
    setPending('unstake');
    setStatusMsg('Preparing unstake...');

    try {
      const owner = new PublicKey(solanaAddress);
      const ix = buildUnstakeIx(owner, tier.index, position.amount);
      const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
      const { blockhash } = await connection.getLatestBlockhash('confirmed');

      const tx = new Transaction();
      tx.add(ix);
      tx.recentBlockhash = blockhash;
      tx.feePayer = owner;

      setStatusMsg('Sign the transaction in your wallet...');
      const sig = await sendStakeTx(tx, connection);
      setStatusMsg('Confirming on-chain...');
      await confirmTx(connection, sig);

      setStatusMsg(`Unstaked ${formatTokenAmount(position.amount, atelierDecimals, 2)} ATELIER.`);
      onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unstake failed');
      setStatusMsg(null);
    } finally {
      setPending(null);
    }
  }, [
    hasStake,
    unlocked,
    position,
    solanaAddress,
    tier.index,
    atelierDecimals,
    sendStakeTx,
    onRefresh,
  ]);

  const handleClaim = useCallback(async () => {
    if (claimable === 0n) return;
    setErrorMsg(null);
    setPending('claim');
    setStatusMsg('Preparing claim...');

    try {
      const owner = new PublicKey(solanaAddress);
      // Claim pays wSOL; wrap the flow so the user receives native SOL:
      // ensure the wSOL ATA -> claim into it -> close it (unwraps to SOL).
      const tx = new Transaction();
      tx.add(ensureRewardAtaIx(owner, owner));
      tx.add(buildClaimIx(owner, tier.index));
      tx.add(unwrapRewardIx(owner));

      const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = owner;

      setStatusMsg('Sign the transaction in your wallet...');
      const sig = await sendStakeTx(tx, connection);
      setStatusMsg('Confirming on-chain...');
      await confirmTx(connection, sig);

      setStatusMsg(`Claimed ${formatSol(claimable, 6)} SOL.`);
      onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Claim failed');
      setStatusMsg(null);
    } finally {
      setPending(null);
    }
  }, [claimable, solanaAddress, tier.index, sendStakeTx, onRefresh]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.07 }}
      className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-neutral-800/60">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-atelier/10 font-mono text-[11px] font-bold text-atelier">
            {tier.multiplierLabel}
          </span>
          <span className="font-mono text-[12px] font-semibold text-black dark:text-white">
            {tier.label}
          </span>
        </div>
        {!hasStake && (
          <span className="font-mono text-[10px] text-gray-400 dark:text-neutral-600">No position</span>
        )}
        {hasStake && !unlocked && position && (
          <span className="font-mono text-[10px] text-amber-500 dark:text-amber-400 tabular-nums">
            Unlocks in {formatLockCountdown(position.lockUntil)}
          </span>
        )}
        {hasStake && unlocked && (
          <span className="font-mono text-[10px] text-emerald-500 dark:text-emerald-400">
            Unlocked
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {hasStake && position ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-neutral-600 mb-0.5">
                  Staked
                </p>
                <p className="font-mono text-[14px] font-semibold text-black dark:text-white tabular-nums">
                  {formatTokenAmount(position.amount, atelierDecimals, 2)}
                </p>
                <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-500">ATELIER</p>
              </div>
              <div>
                <p className="font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-neutral-600 mb-0.5">
                  Claimable
                </p>
                <p className="font-mono text-[14px] font-semibold text-emerald-500 dark:text-emerald-400 tabular-nums">
                  {formatSol(claimable, 6)}
                </p>
                <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-500">SOL</p>
              </div>
            </div>

            {(statusMsg || errorMsg) && (
              <StatusBanner
                type={errorMsg ? 'error' : pending ? 'info' : 'success'}
                message={(errorMsg ?? statusMsg)!}
              />
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleClaim()}
                disabled={claimable === 0n || !!pending}
                className="flex-1 inline-flex items-center justify-center gap-2 h-9 rounded-lg font-mono text-[11px] font-medium border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {pending === 'claim' ? (
                  <>
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Claiming...
                  </>
                ) : (
                  'Claim SOL'
                )}
              </button>
              <button
                type="button"
                onClick={() => void handleUnstake()}
                disabled={!unlocked || !!pending}
                title={
                  !unlocked && position
                    ? `Locked until ${new Date(Number(position.lockUntil) * 1000).toLocaleDateString()}`
                    : undefined
                }
                className="flex-1 inline-flex items-center justify-center gap-2 h-9 rounded-lg font-mono text-[11px] font-medium border border-gray-200 dark:border-neutral-800 text-gray-600 dark:text-neutral-400 hover:border-atelier/40 hover:text-atelier disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {pending === 'unstake' ? (
                  <>
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Unstaking...
                  </>
                ) : (
                  'Unstake'
                )}
              </button>
            </div>
          </>
        ) : (
          <p className="font-mono text-[11px] text-gray-400 dark:text-neutral-600 py-1">
            Stake $ATELIER in this tier to earn SOL revenue-share.
          </p>
        )}
      </div>
    </motion.div>
  );
}
