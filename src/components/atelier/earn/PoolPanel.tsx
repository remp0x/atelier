'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { getPrivyAccessToken } from '@/lib/privy-client';
import type { PoolData, Position, WithdrawStep } from './types';
import { microToUsd, formatUsd } from './types';
import { StatusBanner } from './StatusBanner';
import { DepositPanel } from './DepositPanel';

type PanelView = 'overview' | 'deposit' | 'withdraw';

interface PositionRowProps {
  position: Position;
  poolTotal: number;
  onWithdraw: (position: Position) => void;
}

function PositionRow({ position, poolTotal, onWithdraw }: PositionRowProps) {
  const principal = parseFloat(position.principal_usd);
  const value = position.value_usd !== null ? parseFloat(position.value_usd) : null;
  const pnl = value !== null ? value - principal : null;
  const pnlPositive = pnl !== null && pnl >= 0;
  const poolShare = value !== null && poolTotal > 0 ? (value / poolTotal) * 100 : null;

  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-gray-100 dark:border-neutral-800/60 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-gray-400 dark:text-neutral-500 truncate">
          {position.pool_market}
        </p>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className="font-mono text-[16px] font-semibold text-black dark:text-white tabular-nums">
            ${value !== null ? formatUsd(value) : formatUsd(principal)}
          </span>
          {pnl !== null && (
            <span className={`font-mono text-[12px] tabular-nums ${pnlPositive ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
              {pnlPositive ? '+' : ''}{formatUsd(pnl)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-600 tabular-nums">
            Deposited ${formatUsd(principal)}
          </p>
          {poolShare !== null && (
            <>
              <span className="text-gray-300 dark:text-neutral-700 text-[10px]">·</span>
              <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-600 tabular-nums">
                {poolShare.toFixed(2)}% of pool
              </p>
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onWithdraw(position)}
        className="inline-flex items-center gap-1 h-8 px-3 rounded-lg font-mono text-[11px] border border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-400 hover:border-atelier/40 hover:text-atelier transition-colors cursor-pointer shrink-0 min-w-[44px]"
      >
        Withdraw
      </button>
    </div>
  );
}

interface WithdrawFlowProps {
  position: Position;
  solanaAddress: string;
  onSuccess: () => Promise<void>;
  onCancel: () => void;
}

function WithdrawFlow({ position, solanaAddress, onSuccess, onCancel }: WithdrawFlowProps) {
  const [step, setStep] = useState<WithdrawStep>('idle');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const principal = parseFloat(position.principal_usd);
  const value = position.value_usd !== null ? parseFloat(position.value_usd) : null;

  const handleWithdraw = useCallback(async () => {
    setErrorMsg(null);
    setStep('submitting');
    setStatusMsg('Submitting withdrawal...');

    try {
      const token = await getPrivyAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const body: Record<string, unknown> = { all: true };
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

      setStep('done');
      const data = json.data;
      if (data?.status === 'queued') {
        setStatusMsg('Withdrawal queued — funds will settle automatically when liquidity is available.');
      } else {
        const received = data?.received_micro_usdc
          ? `$${formatUsd(microToUsd(data.received_micro_usdc))} USDC`
          : 'your deposit';
        setStatusMsg(`Settled: ${received} returned to your wallet.`);
      }

      await onSuccess();
    } catch (err) {
      setStep('idle');
      setErrorMsg(err instanceof Error ? err.message : 'Withdrawal failed');
      setStatusMsg(null);
    }
  }, [position, solanaAddress, onSuccess]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-black p-4 space-y-3">
        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-500">
          Withdrawing from
        </p>
        <p className="font-mono text-[13px] text-black dark:text-white">{position.pool_market}</p>
        <div className="flex items-center gap-4">
          <div>
            <p className="font-mono text-[9px] text-gray-400 dark:text-neutral-600">Deposited</p>
            <p className="font-mono text-[15px] tabular-nums text-black dark:text-white">${formatUsd(principal)}</p>
          </div>
          {value !== null && (
            <>
              <div className="w-px h-7 bg-gray-200 dark:bg-neutral-800" />
              <div>
                <p className="font-mono text-[9px] text-gray-400 dark:text-neutral-600">Current value</p>
                <p className="font-mono text-[15px] tabular-nums text-black dark:text-white">${formatUsd(value)}</p>
              </div>
            </>
          )}
        </div>
      </div>

      {statusMsg && (
        <StatusBanner
          type={step === 'done' ? (statusMsg.includes('queued') ? 'warning' : 'success') : 'info'}
          message={statusMsg}
        />
      )}
      {errorMsg && <StatusBanner type="error" message={errorMsg} />}

      {step !== 'done' ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={step === 'submitting'}
            className="h-11 px-5 rounded-lg font-mono text-[12px] border border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-400 hover:border-atelier/40 hover:text-atelier disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleWithdraw()}
            disabled={step === 'submitting'}
            className="flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-lg font-mono text-[12px] font-medium border border-atelier text-atelier hover:bg-atelier hover:text-white disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/60 transition-colors cursor-pointer"
          >
            {step === 'submitting' ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
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
      ) : (
        <button
          type="button"
          onClick={onCancel}
          className="w-full h-11 rounded-lg font-mono text-[12px] font-medium border border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-400 hover:border-atelier/40 hover:text-atelier transition-colors cursor-pointer"
        >
          Done
        </button>
      )}
    </div>
  );
}

interface PoolPanelProps {
  pool: PoolData;
  solanaAddress: string | null;
  solanaBalance: number;
  baseBalance: number;
  balanceLoading: boolean;
  authenticated: boolean;
  login: () => void;
  onPoolRefresh: () => Promise<void>;
}

export function PoolPanel({ pool, solanaAddress, solanaBalance, baseBalance, balanceLoading, authenticated, login, onPoolRefresh }: PoolPanelProps) {
  const [view, setView] = useState<PanelView>('overview');
  const [positions, setPositions] = useState<Position[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(authenticated);
  const [withdrawTarget, setWithdrawTarget] = useState<Position | null>(null);

  const fetchPositions = useCallback(async () => {
    if (!authenticated) return;
    setPositionsLoading(true);
    try {
      const token = await getPrivyAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/earn/parquet/positions', { headers });
      if (!res.ok) return;
      const json = await res.json() as { success: boolean; data?: Position[] };
      if (json.success && json.data) setPositions(json.data);
    } catch {
      // positions are a convenience display; fail silently
    } finally {
      setPositionsLoading(false);
    }
  }, [authenticated]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchPositions(), onPoolRefresh()]);
  }, [fetchPositions, onPoolRefresh]);

  useEffect(() => {
    void fetchPositions();
  }, [fetchPositions]);

  const totalUsd = microToUsd(pool.total_usdc_micro);
  const availableUsd = microToUsd(pool.available_usdc_micro);
  const reservedUsd = microToUsd(pool.reserved_usdc_micro);

  const aggregateValue = positions.reduce<number | null>((acc, pos) => {
    if (pos.value_usd === null) return acc;
    return (acc ?? 0) + parseFloat(pos.value_usd);
  }, null);
  const aggregatePrincipal = positions.reduce((acc, pos) => acc + parseFloat(pos.principal_usd), 0);
  const aggregatePnl = aggregateValue !== null ? aggregateValue - aggregatePrincipal : null;
  const pnlPositive = aggregatePnl !== null && aggregatePnl >= 0;

  const openWithdraw = useCallback((position: Position) => {
    setWithdrawTarget(position);
    setView('withdraw');
  }, []);

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-200 dark:border-neutral-800/60">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-atelier/10 border border-atelier/20 shrink-0">
            <svg className="w-4 h-4 text-atelier" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
          </span>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gray-400 dark:text-neutral-500">Selected pool</p>
            <p className="font-display font-semibold text-[14px] text-black dark:text-white leading-tight">
              {pool.market.toUpperCase()} <span className="font-mono font-normal text-[11px] text-gray-400 dark:text-neutral-600">/ USDC</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {pool.stressed && (
            <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-amber-500/10 border border-amber-500/30 font-mono text-[9px] text-amber-500">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
              Stressed
            </span>
          )}
          {view !== 'overview' && (
            <button
              type="button"
              onClick={() => { setView('overview'); setWithdrawTarget(null); }}
              className="font-mono text-[10px] text-gray-400 dark:text-neutral-600 hover:text-atelier transition-colors cursor-pointer h-8 px-2 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-900"
            >
              Back
            </button>
          )}
        </div>
      </div>

      {/* Stress warning */}
      {pool.stressed && view === 'overview' && (
        <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5">
          <svg className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          </svg>
          <p className="font-mono text-[11px] text-amber-500 leading-snug">
            Pool is under stress. Withdrawals may be queued. New deposits carry elevated risk.
          </p>
        </div>
      )}

      {/* Overview */}
      {view === 'overview' && (
        <div className="px-5 py-5 space-y-5">
          {/* Your position */}
          {!authenticated ? null : positionsLoading ? (
            <div className="space-y-2">
              <div className="h-3 w-20 rounded bg-gray-200 dark:bg-neutral-800 animate-pulse" />
              <div className="h-7 w-28 rounded bg-gray-200 dark:bg-neutral-800 animate-pulse" />
            </div>
          ) : positions.length > 0 ? (
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gray-400 dark:text-neutral-500 mb-2">
                Your position
              </p>
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="font-mono text-[26px] font-semibold text-black dark:text-white tabular-nums leading-none">
                  ${aggregateValue !== null ? formatUsd(aggregateValue) : formatUsd(aggregatePrincipal)}
                </span>
                {aggregatePnl !== null && (
                  <span className={`font-mono text-[13px] tabular-nums ${pnlPositive ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                    {pnlPositive ? '+' : ''}{formatUsd(aggregatePnl)}
                  </span>
                )}
              </div>
              <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-600 tabular-nums mb-3">
                Deposited ${formatUsd(aggregatePrincipal)}
              </p>
              <div className="border-t border-gray-100 dark:border-neutral-800/60">
                {positions.map((pos) => (
                  <PositionRow
                    key={pos.vault_id}
                    position={pos}
                    poolTotal={totalUsd}
                    onWithdraw={openWithdraw}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-100 dark:border-neutral-800/60 bg-gray-50 dark:bg-black/40 px-4 py-4">
              <p className="font-mono text-[12px] font-medium text-black dark:text-white mb-0.5">No position yet</p>
              <p className="font-mono text-[11px] text-gray-400 dark:text-neutral-600 leading-snug">
                Deposit USDC to start earning a share of trading fees.
              </p>
            </div>
          )}

          {/* Pool stats */}
          <div className="rounded-lg border border-gray-100 dark:border-neutral-800/40 bg-gray-50/50 dark:bg-black/20 px-4 py-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-gray-400 dark:text-neutral-600 mb-3">
              Pool stats
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="font-mono text-[9px] text-gray-400 dark:text-neutral-600 mb-0.5">TVL</p>
                <p className="font-mono text-[13px] tabular-nums text-black dark:text-white">${formatUsd(totalUsd)}</p>
              </div>
              <div>
                <p className="font-mono text-[9px] text-gray-400 dark:text-neutral-600 mb-0.5">Free</p>
                <p className={`font-mono text-[13px] tabular-nums ${pool.stressed ? 'text-amber-500' : 'text-black dark:text-white'}`}>
                  ${formatUsd(availableUsd)}
                </p>
              </div>
              <div>
                <p className="font-mono text-[9px] text-gray-400 dark:text-neutral-600 mb-0.5">In use</p>
                <p className="font-mono text-[13px] tabular-nums text-black dark:text-white">${formatUsd(reservedUsd)}</p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800/60">
              <p className="font-mono text-[10px] text-gray-500 dark:text-neutral-500 leading-snug">
                Fee share: LPs earn <strong className="text-black dark:text-white">60%</strong> of trading fees, paid in USDC.{' '}
                New pool — no yield history yet.
              </p>
            </div>
          </div>

          {/* Deposit CTA */}
          {authenticated ? (
            <button
              type="button"
              onClick={() => setView('deposit')}
              className="inline-flex items-center gap-2 h-11 px-5 rounded-lg font-mono text-[12px] font-medium bg-atelier text-white hover:bg-atelier-bright focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/60 transition-colors cursor-pointer min-w-[44px]"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Deposit USDC
            </button>
          ) : (
            <button
              type="button"
              onClick={login}
              className="inline-flex items-center gap-2 h-11 px-5 rounded-lg font-mono text-[12px] font-medium border border-atelier/40 text-atelier hover:bg-atelier hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/60 transition-all duration-150 cursor-pointer min-w-[44px]"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
              Sign in to deposit
            </button>
          )}
        </div>
      )}

      {/* Deposit flow */}
      {view === 'deposit' && authenticated && solanaAddress && (
        <div className="px-5 py-5">
          <DepositPanel
            pool={pool}
            solanaAddress={solanaAddress}
            solanaBalance={solanaBalance}
            baseBalance={baseBalance}
            balanceLoading={balanceLoading}
            onDepositSuccess={refreshAll}
            onCancel={() => setView('overview')}
          />
        </div>
      )}

      {/* Withdraw flow */}
      {view === 'withdraw' && authenticated && solanaAddress && withdrawTarget && (
        <div className="px-5 py-5">
          <WithdrawFlow
            position={withdrawTarget}
            solanaAddress={solanaAddress}
            onSuccess={refreshAll}
            onCancel={() => { setView('overview'); setWithdrawTarget(null); }}
          />
        </div>
      )}
    </div>
  );
}
