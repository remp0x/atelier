'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
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

const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const USDC_DECIMALS = 6;

interface PoolData {
  market: string;
  treasury_wallet: string;
  total_usdc_micro: string;
  reserved_usdc_micro: string;
  queue_total_owed_micro: string;
  available_usdc_micro: string;
  lp_supply: string;
  stressed: boolean;
}

interface Position {
  vault_id: string;
  pool_market: string;
  shares: string;
  principal_usd: string;
  value_usd: string | null;
}

type EarnView = 'overview' | 'deposit' | 'withdraw';

type DepositStep = 'idle' | 'signing' | 'confirming' | 'submitting' | 'done';

type WithdrawStep = 'idle' | 'submitting' | 'done';

function microToUsd(micro: string): number {
  return Number(micro) / 1e6;
}

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function usdcMicroUnits(amountUsd: number): bigint {
  const [whole, frac = ''] = amountUsd.toFixed(USDC_DECIMALS).split('.');
  const padded = (frac + '0'.repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS);
  return BigInt(whole) * BigInt(10 ** USDC_DECIMALS) + BigInt(padded);
}

interface PositionRowProps {
  position: Position;
  onWithdraw: (position: Position) => void;
  busy: boolean;
}

function PositionRow({ position, onWithdraw, busy }: PositionRowProps) {
  const principal = parseFloat(position.principal_usd);
  const value = position.value_usd !== null ? parseFloat(position.value_usd) : null;
  const pnl = value !== null ? value - principal : null;
  const pnlPositive = pnl !== null && pnl >= 0;

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-100 dark:border-neutral-800/60 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-gray-400 dark:text-neutral-500 truncate">
          {position.pool_market}
        </p>
        {/* Current value is the primary number; principal + PnL are context */}
        <div className="flex items-baseline gap-2 mt-0.5">
          {value !== null ? (
            <span className="font-mono text-[14px] font-medium text-black dark:text-white tabular-nums">
              ${formatUsd(value)}
            </span>
          ) : (
            <span className="font-mono text-[14px] font-medium text-black dark:text-white tabular-nums">
              ${formatUsd(principal)}
            </span>
          )}
          {pnl !== null && (
            <span
              className={`font-mono text-[11px] tabular-nums ${pnlPositive ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}
            >
              {pnlPositive ? '+' : ''}{formatUsd(pnl)}
            </span>
          )}
        </div>
        <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-600 tabular-nums mt-0.5">
          Deposited ${formatUsd(principal)}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onWithdraw(position)}
        disabled={busy}
        className="inline-flex items-center gap-1 h-7 px-3 rounded-md font-mono text-[11px] border border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-400 hover:border-atelier/40 hover:text-atelier disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
      >
        Withdraw
      </button>
    </div>
  );
}

interface StatusBannerProps {
  type: 'error' | 'success' | 'info' | 'warning';
  message: string;
}

function StatusBanner({ type, message }: StatusBannerProps) {
  const styles: Record<StatusBannerProps['type'], string> = {
    error: 'bg-red-500/10 text-red-500 dark:text-red-400',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    info: 'bg-atelier/10 text-atelier',
    warning: 'bg-amber-500/10 text-amber-500 dark:text-amber-400',
  };

  return (
    <div role={type === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-md px-3 py-2 font-mono text-[11px] leading-snug ${styles[type]}`}>
      {type === 'error' && (
        <svg className="w-3.5 h-3.5 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      )}
      {type === 'success' && (
        <svg className="w-3.5 h-3.5 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      )}
      {(type === 'info' || type === 'warning') && (
        <svg className="w-3.5 h-3.5 shrink-0 mt-px animate-spin" fill="none" viewBox="0 0 24 24" style={type === 'info' ? {} : { animation: 'none' }}>
          {type === 'info' ? (
            <>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </>
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          )}
        </svg>
      )}
      <span>{message}</span>
    </div>
  );
}

export function ParquetEarnCard({ solanaAddress }: { solanaAddress: string | null }) {
  const { wallets: solWallets } = useSolanaWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();

  const solEmbedded = solWallets.find((w) => w.address === solanaAddress) ?? null;

  const [pool, setPool] = useState<PoolData | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [poolLoading, setPoolLoading] = useState(true);
  const [positionsLoading, setPositionsLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);

  const [view, setView] = useState<EarnView>('overview');

  const [depositAmount, setDepositAmount] = useState('');
  const [depositStep, setDepositStep] = useState<DepositStep>('idle');
  const [depositStatus, setDepositStatus] = useState<string | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);

  const [withdrawTarget, setWithdrawTarget] = useState<Position | null>(null);
  const [withdrawStep, setWithdrawStep] = useState<WithdrawStep>('idle');
  const [withdrawStatus, setWithdrawStatus] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const refreshPositionsRef = useRef<(() => Promise<void>) | null>(null);

  const fetchPool = useCallback(async () => {
    setPoolLoading(true);
    try {
      const res = await fetch('/api/earn/parquet/pools');
      if (res.status === 503) {
        setNotConfigured(true);
        return;
      }
      const json = await res.json() as { success: boolean; data?: PoolData; error?: string };
      if (json.success && json.data) {
        setPool(json.data);
        setNotConfigured(false);
      } else {
        setNotConfigured(true);
      }
    } catch {
      setNotConfigured(true);
    } finally {
      setPoolLoading(false);
    }
  }, []);

  const fetchPositions = useCallback(async () => {
    setPositionsLoading(true);
    try {
      const token = await getPrivyAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/earn/parquet/positions', { headers });
      if (!res.ok) return;
      const json = await res.json() as { success: boolean; data?: Position[] };
      if (json.success && json.data) {
        setPositions(json.data);
      }
    } catch {
      // silently fail -- positions are a convenience display
    } finally {
      setPositionsLoading(false);
    }
  }, []);

  refreshPositionsRef.current = fetchPositions;

  useEffect(() => {
    void fetchPool();
    void fetchPositions();
  }, [fetchPool, fetchPositions]);

  const resetDeposit = useCallback(() => {
    setDepositAmount('');
    setDepositStep('idle');
    setDepositStatus(null);
    setDepositError(null);
  }, []);

  const resetWithdraw = useCallback(() => {
    setWithdrawTarget(null);
    setWithdrawStep('idle');
    setWithdrawStatus(null);
    setWithdrawError(null);
  }, []);

  const handleDeposit = useCallback(async () => {
    if (!pool || !solanaAddress || !solEmbedded) return;

    const amountUsd = parseFloat(depositAmount);
    if (Number.isNaN(amountUsd) || amountUsd <= 0) return;

    setDepositError(null);
    setDepositStep('signing');
    setDepositStatus('Building transfer...');

    try {
      const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
      const fromPubkey = new PublicKey(solanaAddress);
      const toPubkey = new PublicKey(pool.treasury_wallet);
      const lamports = usdcMicroUnits(amountUsd);

      const senderAta = await getAssociatedTokenAddress(USDC_MINT, fromPubkey);
      const recipientAta = await getAssociatedTokenAddress(USDC_MINT, toPubkey);

      try {
        const senderAccount = await getAccount(connection, senderAta);
        if (senderAccount.amount < lamports) {
          const have = Number(senderAccount.amount) / 10 ** USDC_DECIMALS;
          throw new Error(`Insufficient USDC. Need $${amountUsd.toFixed(2)}, have $${have.toFixed(2)}`);
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

      setDepositStatus('Sign the transaction in your wallet...');
      const result = await signAndSendTransaction({
        transaction: new Uint8Array(serialized),
        wallet: solEmbedded,
        chain: 'solana:mainnet',
        options: { sponsor: true },
      });

      const sig = bs58.encode(result.signature);
      setDepositStep('confirming');
      setDepositStatus('Confirming on-chain...');

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

      setDepositStep('submitting');
      setDepositStatus('Recording deposit...');

      const token = await getPrivyAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/earn/parquet/deposit', {
        method: 'POST',
        headers,
        body: JSON.stringify({ amount_usd: amountUsd.toFixed(6), incoming_tx_hash: sig }),
      });

      const json = await res.json() as {
        success: boolean;
        data?: { tx_hash: string; shares_minted: string; lp_minted: string; position: { shares: string; principal_usd: string } };
        error?: string;
      };

      if (!json.success) {
        throw new Error(json.error ?? 'Deposit recording failed');
      }

      setDepositStep('done');
      setDepositStatus(`Deposited $${amountUsd.toFixed(2)} USDC. Shares minted: ${json.data?.shares_minted ?? ''}`);
      setDepositAmount('');
      await refreshPositionsRef.current?.();
    } catch (err) {
      setDepositStep('idle');
      setDepositError(err instanceof Error ? err.message : 'Deposit failed');
      setDepositStatus(null);
    }
  }, [pool, solanaAddress, solEmbedded, depositAmount, signAndSendTransaction]);

  const handleWithdraw = useCallback(async (position: Position, all: boolean) => {
    if (!position) return;

    setWithdrawError(null);
    setWithdrawStep('submitting');
    setWithdrawStatus('Submitting withdrawal...');

    try {
      const token = await getPrivyAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const body: Record<string, unknown> = all ? { all: true } : { shares: position.shares };
      // Users have no payout-wallet fallback server-side; send funds back to the
      // connected embedded wallet.
      if (solanaAddress) body.destination_wallet = solanaAddress;

      const res = await fetch('/api/earn/parquet/withdraw', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      const json = await res.json() as {
        success: boolean;
        data?: {
          status: 'settled' | 'queued';
          shares_burned?: string;
          received_micro_usdc?: string;
          tx_hash?: string;
          queue_entry?: unknown;
          note?: string;
        };
        error?: string;
      };

      if (!json.success) {
        throw new Error(json.error ?? 'Withdrawal failed');
      }

      const data = json.data;
      setWithdrawStep('done');

      if (data?.status === 'queued') {
        setWithdrawStatus('Withdrawal queued -- funds will settle automatically when liquidity is available.');
      } else {
        const received = data?.received_micro_usdc ? `$${formatUsd(microToUsd(data.received_micro_usdc))} USDC` : 'your deposit';
        setWithdrawStatus(`Settled: ${received} returned to your wallet.`);
      }

      await refreshPositionsRef.current?.();
    } catch (err) {
      setWithdrawStep('idle');
      setWithdrawError(err instanceof Error ? err.message : 'Withdrawal failed');
      setWithdrawStatus(null);
    }
  }, [solanaAddress]);

  const openWithdraw = useCallback((position: Position) => {
    resetWithdraw();
    setWithdrawTarget(position);
    setView('withdraw');
  }, [resetWithdraw]);

  if (notConfigured) {
    return (
      <div
        data-wallet-card
        className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] px-5 py-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gray-400 dark:text-neutral-500 mb-1">
              EARN
            </p>
            <p className="font-mono text-[13px] text-gray-400 dark:text-neutral-500">
              Parquet Earn -- coming soon
            </p>
          </div>
          <span className="inline-flex items-center h-5 px-2 rounded-full bg-gray-100 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 font-mono text-[9px] uppercase tracking-[0.1em] text-gray-400 dark:text-neutral-600">
            Soon
          </span>
        </div>
      </div>
    );
  }

  const availableUsd = pool ? microToUsd(pool.available_usdc_micro) : 0;
  const totalUsd = pool ? microToUsd(pool.total_usdc_micro) : 0;
  const amountNum = parseFloat(depositAmount);
  const depositValid = !Number.isNaN(amountNum) && amountNum > 0;

  const hasPositions = !positionsLoading && positions.length > 0;

  const aggregateValue = positions.reduce<number | null>((acc, pos) => {
    if (pos.value_usd === null) return acc;
    return (acc ?? 0) + parseFloat(pos.value_usd);
  }, null);

  const aggregatePrincipal = positions.reduce(
    (acc, pos) => acc + parseFloat(pos.principal_usd),
    0,
  );

  const aggregatePnl = aggregateValue !== null ? aggregateValue - aggregatePrincipal : null;
  const aggregatePnlPositive = aggregatePnl !== null && aggregatePnl >= 0;

  const poolSharePct =
    aggregateValue !== null && totalUsd > 0
      ? (aggregateValue / totalUsd) * 100
      : null;

  return (
    <div
      data-wallet-card
      className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-200 dark:border-neutral-800/60">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-atelier/10 border border-atelier/20 shrink-0">
            <svg className="w-3.5 h-3.5 text-atelier" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
          </span>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gray-400 dark:text-neutral-500">
              EARN
            </p>
            <p className="font-mono text-[12px] font-medium text-black dark:text-white leading-tight">
              Parquet Pool
              {pool && (
                <span className="ml-1.5 font-mono text-[10px] text-gray-400 dark:text-neutral-600 font-normal">
                  {pool.market}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {pool?.stressed && (
            <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-amber-500/10 border border-amber-500/30 font-mono text-[9px] uppercase tracking-[0.1em] text-amber-500">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
              Stressed
            </span>
          )}
          {view !== 'overview' && (
            <button
              type="button"
              onClick={() => {
                resetDeposit();
                resetWithdraw();
                setView('overview');
              }}
              className="font-mono text-[10px] text-gray-400 dark:text-neutral-600 hover:text-atelier transition-colors cursor-pointer"
            >
              Back
            </button>
          )}
        </div>
      </div>

      {/* Stressed warning */}
      {pool?.stressed && view === 'overview' && (
        <div className="mx-5 mt-3 flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2">
          <svg className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          </svg>
          <p className="font-mono text-[11px] text-amber-500 leading-snug">
            Pool is under stress. Withdrawals may be queued. New deposits carry elevated risk.
          </p>
        </div>
      )}

      {/* Overview: positions + actions */}
      {view === 'overview' && (
        <div className="px-5 py-4 space-y-4">

          {/* Position hero -- shown when user has at least one position */}
          {positionsLoading ? (
            <div className="space-y-2">
              <div className="h-3 w-40 rounded bg-gray-200 dark:bg-neutral-800 animate-pulse" />
              <div className="h-3 w-32 rounded bg-gray-200 dark:bg-neutral-800 animate-pulse" />
            </div>
          ) : hasPositions ? (
            <div>
              {/* Aggregate position summary */}
              <div className="mb-3 pb-3 border-b border-gray-100 dark:border-neutral-800/60">
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gray-400 dark:text-neutral-500 mb-1">
                  Your balance
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[22px] font-semibold text-black dark:text-white tabular-nums leading-none">
                    ${aggregateValue !== null ? formatUsd(aggregateValue) : formatUsd(aggregatePrincipal)}
                  </span>
                  {aggregatePnl !== null && (
                    <span className={`font-mono text-[12px] tabular-nums ${aggregatePnlPositive ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                      {aggregatePnlPositive ? '+' : ''}{formatUsd(aggregatePnl)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-600 tabular-nums">
                    Deposited ${formatUsd(aggregatePrincipal)}
                  </p>
                  {poolSharePct !== null && (
                    <>
                      <span className="text-gray-300 dark:text-neutral-700">·</span>
                      <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-600 tabular-nums">
                        {poolSharePct.toFixed(2)}% of pool
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Per-position rows */}
              <div className="mb-3">
                {positions.map((pos) => (
                  <PositionRow
                    key={pos.vault_id}
                    position={pos}
                    onWithdraw={openWithdraw}
                    busy={false}
                  />
                ))}
              </div>
            </div>
          ) : (
            /* No-position state: CTA is primary, pool stats are secondary context */
            <div className="rounded-lg border border-gray-100 dark:border-neutral-800/60 bg-gray-50 dark:bg-black/40 px-4 py-4">
              <p className="font-mono text-[11px] font-medium text-black dark:text-white mb-0.5">
                Deposit to start earning
              </p>
              <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-600 leading-snug">
                Deposit USDC into the Parquet pool and earn a share of trading fees.
              </p>
            </div>
          )}

          {/* Pool context -- secondary, clearly labeled as pool-wide numbers */}
          {!poolLoading && pool && (
            <div className="rounded-md border border-gray-100 dark:border-neutral-800/40 bg-gray-50/50 dark:bg-black/20 px-3 py-2.5">
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-gray-400 dark:text-neutral-600 mb-2">
                Pool
              </p>
              <div className="flex items-center gap-4">
                <div>
                  <p className="font-mono text-[9px] text-gray-400 dark:text-neutral-600">
                    Pool TVL
                  </p>
                  <p className="font-mono text-[12px] tabular-nums text-black dark:text-white">
                    ${formatUsd(totalUsd)}
                  </p>
                </div>
                <div className="w-px h-5 bg-gray-200 dark:bg-neutral-800" />
                <div>
                  <p className="font-mono text-[9px] text-gray-400 dark:text-neutral-600">
                    Free liquidity
                  </p>
                  <p className={`font-mono text-[12px] tabular-nums ${pool.stressed ? 'text-amber-500' : 'text-black dark:text-white'}`}>
                    ${formatUsd(availableUsd)}
                  </p>
                </div>
              </div>
              <p className="font-mono text-[9px] text-gray-400 dark:text-neutral-700 mt-1.5 leading-snug">
                These figures describe the pool, not your balance.
              </p>
            </div>
          )}

          {/* Deposit button */}
          <button
            type="button"
            onClick={() => { resetDeposit(); setView('deposit'); }}
            disabled={!pool || !solanaAddress}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md font-mono text-[11px] font-medium bg-atelier text-white hover:bg-atelier-bright disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/60 transition-colors cursor-pointer"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Deposit USDC
          </button>

          {/* Principal-at-risk disclosure */}
          <div className="flex items-start gap-2 rounded-md border border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-black px-3 py-2.5">
            <svg className="w-3.5 h-3.5 text-gray-400 dark:text-neutral-500 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <p className="font-mono text-[10px] text-gray-500 dark:text-neutral-500 leading-relaxed">
              <strong className="text-gray-700 dark:text-neutral-300">Principal at risk.</strong>{' '}
              This is a custodial, leveraged liquidity pool. Your principal can lose value. Withdrawals may be queued when liquidity is limited. Only deposit what you can afford to lose.
            </p>
          </div>
        </div>
      )}

      {/* Deposit flow */}
      {view === 'deposit' && (
        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gray-400 dark:text-neutral-500 mb-3">
              Deposit amount
            </p>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[13px] text-gray-400 dark:text-neutral-600">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={depositAmount}
                  onChange={(e) => { setDepositAmount(e.target.value); setDepositError(null); }}
                  placeholder="0.00"
                  disabled={depositStep !== 'idle'}
                  aria-label="Deposit amount in USDC"
                  className="w-full h-9 pl-6 pr-3 rounded-md bg-gray-50 dark:bg-black border border-gray-200 dark:border-neutral-800 text-black dark:text-white text-[13px] font-mono placeholder:text-gray-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-atelier disabled:opacity-50"
                />
              </div>

              <div className="flex items-center gap-1 h-9 px-2.5 rounded-md border border-gray-200 dark:border-neutral-800 shrink-0">
                <Image src="/usdc.svg" alt="USDC" width={14} height={14} className="object-contain" style={{ width: 14, height: 14 }} />
                <span className="font-mono text-[11px] text-black dark:text-white">USDC</span>
              </div>
            </div>

            <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-600 mt-1.5">
              Solana USDC. Pool free liquidity: <span className="tabular-nums">${formatUsd(availableUsd)}</span>
            </p>
          </div>

          {/* Deposit progress steps */}
          {depositStep !== 'idle' && (
            <div className="space-y-1.5">
              {[
                { key: 'signing' as DepositStep, label: 'Step 1: Sign transfer' },
                { key: 'confirming' as DepositStep, label: 'Step 2: On-chain confirmation' },
                { key: 'submitting' as DepositStep, label: 'Step 3: Record deposit' },
              ].map(({ key, label }) => {
                const stepOrder: DepositStep[] = ['signing', 'confirming', 'submitting', 'done'];
                const currentIdx = stepOrder.indexOf(depositStep);
                const keyIdx = stepOrder.indexOf(key);
                const isDone = depositStep === 'done' || currentIdx > keyIdx;
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
                    <span className={`font-mono text-[11px] ${isActive ? 'text-atelier' : isDone ? 'text-emerald-500 dark:text-emerald-400' : 'text-gray-400 dark:text-neutral-600'}`}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {depositStatus && depositStep !== 'idle' && (
            <StatusBanner
              type={depositStep === 'done' ? 'success' : 'info'}
              message={depositStatus}
            />
          )}

          {depositError && <StatusBanner type="error" message={depositError} />}

          <div className="flex gap-2">
            {depositStep === 'done' ? (
              <button
                type="button"
                onClick={() => { resetDeposit(); setView('overview'); }}
                className="w-full h-9 rounded-md font-mono text-[11px] font-medium border border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-400 hover:border-atelier/40 hover:text-atelier transition-colors cursor-pointer"
              >
                Done
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => { resetDeposit(); setView('overview'); }}
                  disabled={depositStep !== 'idle'}
                  className="h-9 px-4 rounded-md font-mono text-[11px] border border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-400 hover:border-atelier/40 hover:text-atelier disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeposit()}
                  disabled={!depositValid || depositStep !== 'idle' || !solanaAddress}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-md font-mono text-[11px] font-medium bg-atelier text-white hover:bg-atelier-bright disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/60 transition-colors cursor-pointer"
                >
                  {depositStep !== 'idle' ? (
                    <>
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
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

          {/* Disclosure inline with deposit form */}
          <div className="flex items-start gap-2 rounded-md border border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-black px-3 py-2">
            <svg className="w-3 h-3 text-gray-400 dark:text-neutral-600 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <p className="font-mono text-[10px] text-gray-500 dark:text-neutral-500 leading-snug">
              <strong className="text-gray-700 dark:text-neutral-300">Risk disclosure:</strong>{' '}
              Custodial leveraged pool. Principal can lose value. Withdrawals may queue.
            </p>
          </div>
        </div>
      )}

      {/* Withdraw flow */}
      {view === 'withdraw' && withdrawTarget && (
        <div className="px-5 py-4 space-y-4">
          <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-black p-3 space-y-2">
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-500">
              Withdrawing from
            </p>
            <p className="font-mono text-[12px] text-black dark:text-white">{withdrawTarget.pool_market}</p>
            <div className="flex items-center gap-3">
              <div>
                <p className="font-mono text-[9px] text-gray-400 dark:text-neutral-600">Principal</p>
                <p className="font-mono text-[13px] tabular-nums text-black dark:text-white">
                  ${formatUsd(parseFloat(withdrawTarget.principal_usd))}
                </p>
              </div>
              {withdrawTarget.value_usd !== null && (
                <>
                  <div className="w-px h-6 bg-gray-200 dark:bg-neutral-800" />
                  <div>
                    <p className="font-mono text-[9px] text-gray-400 dark:text-neutral-600">Current value</p>
                    <p className="font-mono text-[13px] tabular-nums text-black dark:text-white">
                      ${formatUsd(parseFloat(withdrawTarget.value_usd))}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {withdrawStatus && (
            <StatusBanner
              type={withdrawStep === 'done' ? (withdrawStatus.includes('queued') ? 'warning' : 'success') : 'info'}
              message={withdrawStatus}
            />
          )}

          {withdrawError && <StatusBanner type="error" message={withdrawError} />}

          {withdrawStep !== 'done' && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { resetWithdraw(); setView('overview'); }}
                disabled={withdrawStep === 'submitting'}
                className="h-9 px-4 rounded-md font-mono text-[11px] border border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-400 hover:border-atelier/40 hover:text-atelier disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleWithdraw(withdrawTarget, true)}
                disabled={withdrawStep === 'submitting'}
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-md font-mono text-[11px] font-medium border border-atelier text-atelier hover:bg-atelier hover:text-white disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/60 transition-colors cursor-pointer"
              >
                {withdrawStep === 'submitting' ? (
                  <>
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Withdrawing...
                  </>
                ) : (
                  'Withdraw all'
                )}
              </button>
            </div>
          )}

          {withdrawStep === 'done' && (
            <button
              type="button"
              onClick={() => { resetWithdraw(); setView('overview'); }}
              className="w-full h-9 rounded-md font-mono text-[11px] font-medium border border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-400 hover:border-atelier/40 hover:text-atelier transition-colors cursor-pointer"
            >
              Done
            </button>
          )}
        </div>
      )}
    </div>
  );
}
