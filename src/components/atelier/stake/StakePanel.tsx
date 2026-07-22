'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { STAKING_TIERS } from '@/lib/staking-config';
import { buildStakeIx } from '@/lib/staking-program';
import { StatusBanner } from '@/components/atelier/earn/StatusBanner';
import { parseTokenInput, formatTokenAmount, type StakingStatsData } from './types';
import { useStakeTxSender, type StakeWalletMode } from './useStakeTxSender';

const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

interface Props {
  solanaAddress: string;
  walletMode: StakeWalletMode;
  atelierBalance: bigint;
  balanceLoading: boolean;
  stats: StakingStatsData;
  onSuccess: () => void;
}

type TxStep = 'idle' | 'signing' | 'confirming' | 'done';

export function StakePanel({
  solanaAddress,
  walletMode,
  atelierBalance,
  balanceLoading,
  stats,
  onSuccess,
}: Props) {
  const sendStakeTx = useStakeTxSender(walletMode, solanaAddress);

  const [selectedTier, setSelectedTier] = useState(0);
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<TxStep>('idle');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { atelierDecimals } = stats;

  const amountBigInt = parseTokenInput(amount, atelierDecimals);
  const isValid =
    amountBigInt > 0n && amountBigInt <= atelierBalance && !stats.paused;

  const handleMax = useCallback(() => {
    setErrorMsg(null);
    const whole = atelierBalance / 10n ** BigInt(atelierDecimals);
    const frac = atelierBalance % 10n ** BigInt(atelierDecimals);
    const fracStr = frac.toString().padStart(atelierDecimals, '0').slice(0, 6);
    setAmount(`${whole}.${fracStr}`.replace(/\.?0+$/, ''));
  }, [atelierBalance, atelierDecimals]);

  const handleStake = useCallback(async () => {
    if (!isValid) return;
    setErrorMsg(null);
    setStep('signing');
    setStatusMsg('Building stake transaction...');

    try {
      const owner = new PublicKey(solanaAddress);
      const ix = buildStakeIx(owner, selectedTier, amountBigInt);
      const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
      const { blockhash } = await connection.getLatestBlockhash('confirmed');

      const tx = new Transaction();
      tx.add(ix);
      tx.recentBlockhash = blockhash;
      tx.feePayer = owner;

      setStatusMsg('Sign the transaction in your wallet...');
      const sig = await sendStakeTx(tx, connection);
      setStep('confirming');
      setStatusMsg('Confirming on-chain...');

      let confirmed = false;
      for (let i = 0; i < 40; i++) {
        const { value } = await connection.getSignatureStatuses([sig]);
        const status = value[0];
        if (status) {
          if (status.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
          }
          if (
            status.confirmationStatus === 'confirmed' ||
            status.confirmationStatus === 'finalized'
          ) {
            confirmed = true;
            break;
          }
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 1500));
      }
      if (!confirmed) {
        throw new Error('Transaction not confirmed in time. Check your wallet before retrying.');
      }

      setStep('done');
      const formatted = formatTokenAmount(amountBigInt, atelierDecimals, 2);
      setStatusMsg(`Staked ${formatted} ATELIER in ${STAKING_TIERS[selectedTier]?.label ?? 'tier'}.`);
      setAmount('');
      onSuccess();
    } catch (err) {
      setStep('idle');
      setErrorMsg(err instanceof Error ? err.message : 'Stake failed');
      setStatusMsg(null);
    }
  }, [
    isValid,
    solanaAddress,
    selectedTier,
    amountBigInt,
    atelierDecimals,
    sendStakeTx,
    onSuccess,
  ]);

  const reset = useCallback(() => {
    setStep('idle');
    setStatusMsg(null);
    setErrorMsg(null);
    setAmount('');
  }, []);

  const balanceFormatted = balanceLoading
    ? null
    : formatTokenAmount(atelierBalance, atelierDecimals, 2);

  const isPending = step === 'signing' || step === 'confirming';

  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-neutral-800/60">
        <span className="font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-neutral-600">
          Stake $ATELIER
        </span>
      </div>

      <div className="p-4 space-y-4">
        {/* Tier selector */}
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-neutral-600 mb-2">
            Lock tier
          </p>
          <div className="grid grid-cols-2 gap-2">
            {STAKING_TIERS.map((tier) => {
              const active = selectedTier === tier.index;
              return (
                <button
                  key={tier.index}
                  type="button"
                  disabled={isPending || step === 'done'}
                  onClick={() => { setSelectedTier(tier.index); setErrorMsg(null); }}
                  className={`relative flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-all cursor-pointer disabled:cursor-not-allowed ${
                    active
                      ? 'border-atelier bg-atelier/8 dark:bg-atelier/10'
                      : 'border-gray-200 dark:border-neutral-800 hover:border-atelier/40'
                  }`}
                >
                  <span
                    className={`font-mono text-[11px] font-semibold ${
                      active ? 'text-atelier' : 'text-black dark:text-white'
                    }`}
                  >
                    {tier.label}
                  </span>
                  <span
                    className={`font-mono text-[10px] ${
                      active ? 'text-atelier/80' : 'text-gray-400 dark:text-neutral-500'
                    }`}
                  >
                    {tier.multiplierLabel} weight
                  </span>
                  {active && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-atelier" />
                  )}
                </button>
              );
            })}
          </div>
          <AnimatePresence>
            <motion.p
              key={selectedTier}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="font-mono text-[10px] text-amber-500 dark:text-amber-400 mt-2 overflow-hidden"
            >
              Staked $ATELIER cannot be unstaked until the lock period ends.
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Amount input */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-neutral-600">
              Amount
            </p>
            <div className="flex items-center gap-1.5">
              {balanceLoading ? (
                <span className="h-3 w-24 rounded bg-gray-200 dark:bg-neutral-800 animate-pulse inline-block" />
              ) : (
                <span className="font-mono text-[11px] text-gray-500 dark:text-neutral-400 tabular-nums">
                  Balance:{' '}
                  <span className="text-black dark:text-white">{balanceFormatted}</span>{' '}
                  ATELIER
                </span>
              )}
              <button
                type="button"
                onClick={handleMax}
                disabled={isPending || step === 'done' || balanceLoading || atelierBalance === 0n}
                className="h-5 px-1.5 rounded font-mono text-[10px] text-atelier border border-atelier/30 hover:bg-atelier/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Max
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setErrorMsg(null); }}
                placeholder="0.00"
                disabled={isPending || step === 'done'}
                aria-label="Amount of ATELIER to stake"
                className="w-full h-11 px-3 rounded-lg bg-gray-50 dark:bg-black border border-gray-200 dark:border-neutral-800 text-black dark:text-white text-[15px] font-mono placeholder:text-gray-300 dark:placeholder:text-neutral-700 focus:outline-none focus:border-atelier disabled:opacity-50 transition-colors"
              />
            </div>
            <div className="flex items-center h-11 px-3 rounded-lg border border-gray-200 dark:border-neutral-800 shrink-0">
              <span className="font-mono text-[12px] text-black dark:text-white">ATELIER</span>
            </div>
          </div>

          {!balanceLoading && amountBigInt > atelierBalance && atelierBalance > 0n && (
            <p className="font-mono text-[10px] text-red-500 mt-1">Exceeds balance</p>
          )}
        </div>

        {/* Status */}
        {step !== 'idle' && statusMsg && (
          <StatusBanner
            type={step === 'done' ? 'success' : 'info'}
            message={statusMsg}
          />
        )}
        {errorMsg && <StatusBanner type="error" message={errorMsg} />}

        {/* CTA */}
        <div className="flex gap-2">
          {step === 'done' ? (
            <button
              type="button"
              onClick={reset}
              className="w-full h-11 rounded-lg font-mono text-[12px] font-medium border border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-400 hover:border-atelier/40 hover:text-atelier transition-colors cursor-pointer"
            >
              Stake more
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleStake()}
              disabled={!isValid || isPending}
              className="flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-lg font-mono text-[12px] font-medium bg-atelier text-white hover:bg-atelier-bright disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/60 transition-colors cursor-pointer"
            >
              {isPending ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {step === 'signing' ? 'Waiting for signature...' : 'Confirming...'}
                </>
              ) : (
                stats.paused ? 'Staking paused' : 'Stake ATELIER'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
