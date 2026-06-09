'use client';

import { useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from '@solana/spl-token';
import { useWallets as useSolanaWallets, useSignAndSendTransaction } from '@privy-io/react-auth/solana';
import bs58 from 'bs58';
import { USDC_MINT } from '@/lib/solana-pay';
import { getPrivyAccessToken } from '@/lib/privy-client';
import type { PoolData, DepositStep, Position } from './types';
import { usdcMicroUnits, formatUsd, microToUsd } from './types';
import { StatusBanner } from './StatusBanner';

const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

const DEPOSIT_STEPS: { key: DepositStep; label: string }[] = [
  { key: 'signing',    label: 'Step 1: Sign transfer' },
  { key: 'confirming', label: 'Step 2: On-chain confirmation' },
  { key: 'submitting', label: 'Step 3: Record deposit' },
];

const STEP_ORDER: DepositStep[] = ['signing', 'confirming', 'submitting', 'done'];

interface DepositPanelProps {
  pool: PoolData;
  solanaAddress: string;
  solanaBalance: number;
  baseBalance: number;
  balanceLoading: boolean;
  onDepositSuccess: () => Promise<void>;
  onCancel: () => void;
}

export function DepositPanel({
  pool,
  solanaAddress,
  solanaBalance,
  baseBalance,
  balanceLoading,
  onDepositSuccess,
  onCancel,
}: DepositPanelProps) {
  const { wallets: solWallets } = useSolanaWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const solEmbedded = solWallets.find((w) => w.address === solanaAddress) ?? null;

  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<DepositStep>('idle');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const amountNum = parseFloat(amount);
  const availableUsd = microToUsd(pool.available_usdc_micro);
  const isFirstDeposit = pool.lp_supply === '0';
  const depositValid =
    !Number.isNaN(amountNum) &&
    amountNum > 0 &&
    amountNum <= solanaBalance &&
    (!isFirstDeposit || amountNum >= 100);

  const reset = useCallback(() => {
    setAmount('');
    setStep('idle');
    setStatusMsg(null);
    setErrorMsg(null);
  }, []);

  const handleMax = useCallback(() => {
    setErrorMsg(null);
    setAmount(solanaBalance.toFixed(2));
  }, [solanaBalance]);

  const handleDeposit = useCallback(async () => {
    if (!pool || !solanaAddress || !solEmbedded) return;
    if (!depositValid) return;

    setErrorMsg(null);
    setStep('signing');
    setStatusMsg('Building transfer...');

    try {
      const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
      const fromPubkey = new PublicKey(solanaAddress);
      const toPubkey = new PublicKey(pool.treasury_wallet);
      const lamports = usdcMicroUnits(amountNum);

      const senderAta = await getAssociatedTokenAddress(USDC_MINT, fromPubkey);
      const recipientAta = await getAssociatedTokenAddress(USDC_MINT, toPubkey);

      try {
        const senderAccount = await getAccount(connection, senderAta);
        if (senderAccount.amount < lamports) {
          const have = Number(senderAccount.amount) / 1e6;
          throw new Error(`Insufficient USDC. Need $${amountNum.toFixed(2)}, have $${have.toFixed(2)}`);
        }
      } catch (err) {
        if (err instanceof TokenAccountNotFoundError || err instanceof TokenInvalidAccountOwnerError) {
          throw new Error('No USDC in this wallet. Fund it with USDC on Solana first.');
        }
        throw err;
      }

      const tx = new Transaction();
      const recipientAtaInfo = await connection.getAccountInfo(recipientAta);
      if (!recipientAtaInfo) {
        tx.add(createAssociatedTokenAccountInstruction(fromPubkey, recipientAta, toPubkey, USDC_MINT));
      }
      tx.add(createTransferInstruction(senderAta, recipientAta, fromPubkey, lamports));

      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = fromPubkey;

      const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });

      setStatusMsg('Sign the transaction in your wallet...');
      const result = await signAndSendTransaction({
        transaction: new Uint8Array(serialized),
        wallet: solEmbedded,
        chain: 'solana:mainnet',
        options: { sponsor: true },
      });

      const sig = bs58.encode(result.signature);
      setStep('confirming');
      setStatusMsg('Confirming on-chain...');

      for (let i = 0; i < 40; i++) {
        const { value } = await connection.getSignatureStatuses([sig]);
        const status = value[0];
        if (status) {
          if (status.err) {
            throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`);
          }
          if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
            break;
          }
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 1500));
      }

      setStep('submitting');
      setStatusMsg('Recording deposit...');

      const token = await getPrivyAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/earn/parquet/deposit', {
        method: 'POST',
        headers,
        body: JSON.stringify({ amount_usd: amountNum.toFixed(6), incoming_tx_hash: sig }),
      });

      const json = await res.json() as {
        success: boolean;
        data?: { tx_hash: string; shares_minted: string; lp_minted: string; position: { shares: string; principal_usd: string } };
        error?: string;
      };

      if (!json.success) {
        throw new Error(json.error ?? 'Deposit recording failed');
      }

      setStep('done');
      setStatusMsg(`Deposited $${amountNum.toFixed(2)} USDC. Shares minted: ${json.data?.shares_minted ?? ''}`);
      setAmount('');
      await onDepositSuccess();
    } catch (err) {
      setStep('idle');
      setErrorMsg(err instanceof Error ? err.message : 'Deposit failed');
      setStatusMsg(null);
    }
  }, [pool, solanaAddress, solEmbedded, depositValid, amountNum, signAndSendTransaction, onDepositSuccess]);

  const showBridgeHint = solanaBalance < 1 && baseBalance >= 1;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gray-400 dark:text-neutral-500">
            Deposit amount
          </p>
          <div className="flex items-center gap-1.5">
            {balanceLoading ? (
              <span className="h-3 w-20 rounded bg-gray-200 dark:bg-neutral-800 animate-pulse inline-block" />
            ) : (
              <span className="font-mono text-[11px] text-gray-500 dark:text-neutral-400 tabular-nums">
                Balance: <span className="text-black dark:text-white">${formatUsd(solanaBalance)}</span> USDC
              </span>
            )}
            <button
              type="button"
              onClick={handleMax}
              disabled={step !== 'idle' || balanceLoading || solanaBalance <= 0}
              className="h-5 px-1.5 rounded font-mono text-[10px] text-atelier border border-atelier/30 hover:bg-atelier/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Max
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[13px] text-gray-400 dark:text-neutral-600">$</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setErrorMsg(null); }}
              placeholder="0.00"
              disabled={step !== 'idle'}
              aria-label="Deposit amount in USDC"
              className="w-full h-11 pl-6 pr-3 rounded-lg bg-gray-50 dark:bg-black border border-gray-200 dark:border-neutral-800 text-black dark:text-white text-[15px] font-mono placeholder:text-gray-300 dark:placeholder:text-neutral-700 focus:outline-none focus:border-atelier disabled:opacity-50 transition-colors"
            />
          </div>
          <div className="flex items-center gap-1.5 h-11 px-3 rounded-lg border border-gray-200 dark:border-neutral-800 shrink-0">
            <Image src="/usdc.svg" alt="USDC" width={16} height={16} className="object-contain" style={{ width: 16, height: 16 }} />
            <span className="font-mono text-[12px] text-black dark:text-white">USDC</span>
          </div>
        </div>

        <div className="flex items-center justify-between mt-1.5 gap-2">
          <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-600">
            Pool free liquidity: <span className="tabular-nums">${formatUsd(availableUsd)}</span>
          </p>
          {!Number.isNaN(amountNum) && amountNum > solanaBalance && solanaBalance > 0 && (
            <p className="font-mono text-[10px] text-red-500">Exceeds balance</p>
          )}
          {isFirstDeposit && !Number.isNaN(amountNum) && amountNum > 0 && amountNum < 100 && (
            <p className="font-mono text-[10px] text-amber-500">$100 minimum (first deposit)</p>
          )}
        </div>
      </div>

      {showBridgeHint && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2.5">
          <svg className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <p className="font-mono text-[11px] text-blue-400 leading-snug">
            You have ${formatUsd(baseBalance)} USDC on Base.{' '}
            <Link href="/wallet" className="underline hover:text-blue-300 transition-colors">
              Bridge it to Solana to deposit
            </Link>
            .
          </p>
        </div>
      )}

      {isFirstDeposit && (
        <div className="flex items-start gap-2 rounded-lg border border-atelier/20 bg-atelier/5 px-3 py-2">
          <svg className="w-3.5 h-3.5 text-atelier shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <p className="font-mono text-[11px] text-atelier leading-snug">
            New pool: $100 minimum for the first deposit.
          </p>
        </div>
      )}

      {step !== 'idle' && (
        <div className="space-y-1.5">
          {DEPOSIT_STEPS.map(({ key, label }) => {
            const currentIdx = STEP_ORDER.indexOf(step);
            const keyIdx = STEP_ORDER.indexOf(key);
            const isDone = step === 'done' || currentIdx > keyIdx;
            const isActive = currentIdx === keyIdx;

            return (
              <div key={key} className="flex items-center gap-2">
                <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                  isDone
                    ? 'border-emerald-500/50 bg-emerald-500/10'
                    : isActive
                      ? 'border-atelier/50 bg-atelier/10'
                      : 'border-gray-200 dark:border-neutral-800'
                }`}>
                  {isDone ? (
                    <svg className="w-2.5 h-2.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : isActive ? (
                    <div className="w-2 h-2 rounded-full border border-atelier border-t-transparent animate-spin" />
                  ) : null}
                </span>
                <span className={`font-mono text-[11px] ${
                  isActive
                    ? 'text-atelier'
                    : isDone
                      ? 'text-emerald-500 dark:text-emerald-400'
                      : 'text-gray-400 dark:text-neutral-600'
                }`}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {statusMsg && step !== 'idle' && (
        <StatusBanner type={step === 'done' ? 'success' : 'info'} message={statusMsg} />
      )}

      {errorMsg && <StatusBanner type="error" message={errorMsg} />}

      <div className="flex gap-2">
        {step === 'done' ? (
          <button
            type="button"
            onClick={() => { reset(); onCancel(); }}
            className="w-full h-11 rounded-lg font-mono text-[12px] font-medium border border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-400 hover:border-atelier/40 hover:text-atelier transition-colors cursor-pointer"
          >
            Done
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => { reset(); onCancel(); }}
              disabled={step !== 'idle'}
              className="h-11 px-5 rounded-lg font-mono text-[12px] border border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-400 hover:border-atelier/40 hover:text-atelier disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleDeposit()}
              disabled={!depositValid || step !== 'idle' || !solEmbedded}
              className="flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-lg font-mono text-[12px] font-medium bg-atelier text-white hover:bg-atelier-bright disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/60 transition-colors cursor-pointer"
            >
              {step !== 'idle' ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Working...
                </>
              ) : (
                'Deposit'
              )}
            </button>
          </>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-black px-3 py-2.5">
        <svg className="w-3.5 h-3.5 text-gray-400 dark:text-neutral-600 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        <p className="font-mono text-[10px] text-gray-500 dark:text-neutral-500 leading-relaxed">
          <strong className="text-gray-700 dark:text-neutral-300">Risk disclosure.</strong>{' '}
          Custodial leveraged pool — your principal can lose value. Withdrawals may be queued when liquidity is limited. Only deposit what you can afford to lose.
        </p>
      </div>
    </div>
  );
}
