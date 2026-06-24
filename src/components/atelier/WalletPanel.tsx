'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Image from 'next/image';
import { useExportWallet as useExportEvmWallet, useCreateWallet, useWallets, useSendTransaction } from '@privy-io/react-auth';
import { useFundWallet as useEvmFundWallet } from '@privy-io/react-auth';
import {
  useExportWallet as useExportSolanaWallet,
  useFundWallet as useSolanaFundWallet,
  useSolanaFundingPlugin,
  useCreateWallet as useCreateSolanaWallet,
  useWallets as useSolanaWallets,
  useSignAndSendTransaction,
} from '@privy-io/react-auth/solana';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getAccount,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from '@solana/spl-token';
import { encodeFunctionData, erc20Abi, isAddress, parseUnits } from 'viem';
import bs58 from 'bs58';
import { base } from 'viem/chains';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { USDC_MINT } from '@/lib/solana-pay';
import { USDC_BASE_ADDRESS } from '@/lib/base-constants';
import { ChainLogo } from '@/components/atelier/ChainBadge';
import { useEmbeddedWallets } from '@/hooks/use-embedded-wallets';
import { useUsdcBalances } from '@/hooks/use-usdc-balances';
import { useBridgeUsdc } from '@/hooks/use-bridge-usdc';
import {
  trackWalletFundStarted,
  trackWalletKeyExported,
  trackWalletBridgeStarted,
  trackWalletBridgeCompleted,
} from '@/lib/analytics';

gsap.registerPlugin(useGSAP);

const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const SOL_ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function middleEllipsis(address: string, keepEach = 8): string {
  if (address.length <= keepEach * 2 + 3) return address;
  return `${address.slice(0, keepEach)}...${address.slice(-keepEach)}`;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard access denied
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="inline-flex items-center justify-center w-6 h-6 rounded text-gray-400 dark:text-neutral-600 hover:text-atelier dark:hover:text-atelier focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/50 transition-colors cursor-pointer shrink-0"
      aria-label={label}
    >
      {copied ? (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}

type SendState = 'idle' | 'sending' | 'done' | 'error';

interface SendModalProps {
  chain: 'base' | 'solana';
  balance: number;
  senderAddress: string;
  onClose: () => void;
  onSuccess: () => void;
  sendSolana: (to: string, amountUsd: number) => Promise<string>;
  sendBase: (to: string, amountUsd: number) => Promise<string>;
}

function SendModal({
  chain,
  balance,
  onClose,
  onSuccess,
  sendSolana,
  sendBase,
}: SendModalProps) {
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [state, setState] = useState<SendState>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const amountNum = parseFloat(amount);
  const toTrimmed = to.trim();

  const addressValid =
    chain === 'solana'
      ? SOL_ADDR_RE.test(toTrimmed)
      : isAddress(toTrimmed);

  const amountValid = !Number.isNaN(amountNum) && amountNum > 0 && amountNum <= balance;
  const canSend = addressValid && amountValid && state === 'idle';

  const txUrl =
    txHash
      ? chain === 'solana'
        ? `https://solscan.io/tx/${txHash}`
        : `https://basescan.org/tx/${txHash}`
      : null;

  const handleMax = () => {
    setAmount(balance > 0 ? balance.toFixed(6) : '');
    setErrMsg(null);
  };

  const handleSend = async () => {
    if (!canSend) return;
    setErrMsg(null);
    setTxHash(null);
    setState('sending');
    setStatusMsg('Building transaction...');
    try {
      let hash: string;
      if (chain === 'solana') {
        setStatusMsg('Sign the transaction in your wallet...');
        hash = await sendSolana(toTrimmed, amountNum);
      } else {
        setStatusMsg('Confirm in your wallet...');
        hash = await sendBase(toTrimmed, amountNum);
      }
      setTxHash(hash);
      setState('done');
      setStatusMsg(`Sent $${amountNum.toFixed(2)} USDC`);
      onSuccess();
    } catch (e) {
      setState('error');
      setErrMsg(e instanceof Error ? e.message : 'Send failed');
      setState('idle');
    }
  };

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && state === 'idle') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [state, onClose]);

  const chainLabel = chain === 'base' ? 'Base' : 'Solana';
  const addrPlaceholder = chain === 'solana' ? 'Base58 address (e.g. 7xKX...AsU)' : '0x address (Base mainnet)';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={() => { if (state === 'idle') onClose(); }}
    >
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-xl w-full max-w-md m-4 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <ChainLogo chain={chain} size={18} />
            <h2 className="font-display font-bold text-base text-black dark:text-white">
              Send USDC on {chainLabel}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={state === 'sending'}
            aria-label="Close"
            className="text-gray-400 dark:text-neutral-500 hover:text-gray-600 dark:hover:text-neutral-300 disabled:opacity-40 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-500 mb-1.5">
              Recipient address
            </label>
            <input
              value={to}
              onChange={(e) => { setTo(e.target.value); setErrMsg(null); }}
              placeholder={addrPlaceholder}
              disabled={state === 'sending'}
              className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-black border border-gray-200 dark:border-neutral-800 text-black dark:text-white text-xs font-mono placeholder:text-gray-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-atelier transition-colors disabled:opacity-50"
            />
            {toTrimmed.length > 0 && !addressValid && (
              <p className="font-mono text-[10px] text-red-500 mt-1">
                Invalid {chainLabel} address
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-mono text-[10px] uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-500">
                Amount (USDC)
              </label>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] text-gray-400 dark:text-neutral-500 tabular-nums">
                  Balance: <span className="text-black dark:text-white">${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </span>
                <button
                  type="button"
                  onClick={handleMax}
                  disabled={state === 'sending' || balance <= 0}
                  className="h-5 px-1.5 rounded font-mono text-[10px] text-atelier border border-atelier/30 hover:bg-atelier/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Max
                </button>
              </div>
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[13px] text-gray-400 dark:text-neutral-600">$</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setErrMsg(null); }}
                placeholder="0.00"
                disabled={state === 'sending'}
                aria-label="Amount to send in USDC"
                className="w-full h-10 pl-6 pr-3 rounded-lg bg-gray-50 dark:bg-black border border-gray-200 dark:border-neutral-800 text-black dark:text-white text-sm font-mono placeholder:text-gray-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-atelier disabled:opacity-50 transition-colors"
              />
            </div>
            {!Number.isNaN(amountNum) && amountNum > balance && balance > 0 && (
              <p className="font-mono text-[10px] text-red-500 mt-1">Exceeds balance</p>
            )}
          </div>

          {chain === 'base' && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
              <svg className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              <p className="font-mono text-[10px] text-blue-400 leading-snug">
                Gas is sponsored. If the transaction fails with an insufficient ETH error, fund a small amount of ETH to your Base wallet for gas.
              </p>
            </div>
          )}

          {state === 'sending' && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-md px-3 py-2 font-mono text-[11px] bg-atelier/10 text-atelier"
            >
              <svg className="w-3.5 h-3.5 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>{statusMsg}</span>
            </div>
          )}

          {state === 'done' && txHash && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-md px-3 py-2 font-mono text-[11px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <span className="truncate">
                {statusMsg}{' '}
                {txUrl && (
                  <a
                    href={txUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-emerald-500 transition-colors"
                  >
                    View tx
                  </a>
                )}
              </span>
            </div>
          )}

          {errMsg && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md px-3 py-2 font-mono text-[11px] bg-red-500/10 text-red-500 dark:text-red-400"
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span className="break-words">{errMsg}</span>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            {state === 'done' ? (
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-lg font-mono text-sm border border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-900 transition-colors cursor-pointer"
              >
                Done
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={state === 'sending'}
                  className="flex-1 py-2.5 rounded-lg border border-gray-200 dark:border-neutral-800 font-mono text-sm text-gray-500 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!canSend}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg font-mono text-sm font-medium bg-atelier text-white hover:bg-atelier-bright disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/60 transition-colors cursor-pointer"
                >
                  {state === 'sending' ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Sending...
                    </>
                  ) : (
                    'Send'
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface WalletCardProps {
  chain: 'base' | 'solana';
  address: string;
  balance: number;
  balanceLoading: boolean;
  onFund: () => Promise<void>;
  onExport: () => Promise<void>;
  onSend: () => void;
}

function WalletCard({
  chain,
  address,
  balance,
  balanceLoading,
  onFund,
  onExport,
  onSend,
}: WalletCardProps) {
  const [funding, setFunding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const balanceRef = useRef<HTMLSpanElement>(null);
  const prevBalanceRef = useRef<number>(0);

  const chainLabel = chain === 'base' ? 'BASE' : 'SOLANA';

  const handleFund = async () => {
    setErr(null);
    setFunding(true);
    try {
      await onFund();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fund flow failed');
    } finally {
      setFunding(false);
    }
  };

  const handleExport = async () => {
    setErr(null);
    setExporting(true);
    try {
      await onExport();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Export flow failed');
    } finally {
      setExporting(false);
    }
  };

  // Balance count-up animation
  useEffect(() => {
    if (balanceLoading) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const el = balanceRef.current;
    if (!el) return;

    const from = prevBalanceRef.current;
    const to = balance;
    prevBalanceRef.current = to;

    if (reduced || from === to) {
      el.textContent = to.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return;
    }

    const obj = { n: from };
    gsap.to(obj, {
      n: to,
      duration: 0.9,
      ease: 'power2.out',
      overwrite: 'auto',
      onUpdate: () => {
        el.textContent = obj.n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      },
    });
  }, [balance, balanceLoading]);

  return (
    <div
      data-wallet-card
      className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] overflow-hidden"
    >
      {/* Card header */}
      <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-gray-200 dark:border-neutral-800/60">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 shrink-0 mt-0.5">
          <ChainLogo chain={chain} size={18} />
        </span>

        {/* Address block */}
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gray-400 dark:text-neutral-500 mb-1">
            {chainLabel}
          </p>
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="font-mono text-[13px] text-black dark:text-white leading-tight truncate"
              title={address}
            >
              <span className="sm:hidden">{middleEllipsis(address, 6)}</span>
              <span className="hidden sm:inline">{middleEllipsis(address, 10)}</span>
            </span>
            <CopyButton text={address} label={`Copy ${chainLabel} address`} />
          </div>
        </div>

        {/* Balance -- top right */}
        <div className="text-right shrink-0 pl-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gray-400 dark:text-neutral-500 mb-1">
            USDC
          </p>
          {balanceLoading ? (
            <div className="h-6 w-20 rounded bg-gray-200 dark:bg-neutral-800 animate-pulse" />
          ) : (
            <p className="font-mono text-lg font-semibold text-black dark:text-white leading-tight">
              <span ref={balanceRef}>
                {balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-5 py-3.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleFund()}
          disabled={funding}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md font-mono text-[11px] font-medium bg-atelier text-white hover:bg-atelier-bright disabled:opacity-50 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/60 transition-colors cursor-pointer"
        >
          {funding ? (
            <>
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Opening...
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Fund
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onSend}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md font-mono text-[11px] border border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-500 hover:border-gray-300 dark:hover:border-neutral-700 hover:text-gray-700 dark:hover:text-neutral-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/40 transition-colors cursor-pointer"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
          Send
        </button>

        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md font-mono text-[11px] border border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-500 hover:border-gray-300 dark:hover:border-neutral-700 hover:text-gray-700 dark:hover:text-neutral-300 disabled:opacity-50 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/40 transition-colors cursor-pointer"
        >
          {exporting ? 'Opening...' : 'Export key'}
        </button>

        {err && (
          <p role="alert" className="w-full font-mono text-[11px] text-red-400 mt-0.5">
            {err}
          </p>
        )}
      </div>
    </div>
  );
}

function PreparingCard({ chain }: { chain: 'base' | 'solana' }) {
  const chainLabel = chain === 'base' ? 'BASE' : 'SOLANA';

  return (
    <div
      data-wallet-card
      className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] px-5 py-5"
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 shrink-0">
          <ChainLogo chain={chain} size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gray-400 dark:text-neutral-500 mb-1">
            {chainLabel}
          </p>
          <p className="font-mono text-xs text-gray-400 dark:text-neutral-500">
            Preparing wallet...
          </p>
        </div>
        <div className="w-5 h-5 rounded-full border-2 border-atelier/30 border-t-atelier animate-spin" />
      </div>
    </div>
  );
}

function bridgeErrorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string' && e) return e;
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>;
    const candidate = o.message ?? o.error ?? o.reason ?? o.cause;
    if (typeof candidate === 'string' && candidate) return candidate;
    try {
      const json = JSON.stringify(e);
      if (json && json !== '{}') return json;
    } catch {
      /* fall through to generic */
    }
  }
  return 'Bridge failed';
}

function BridgeCard({
  solBalance,
  baseBalance,
  balanceLoading,
}: {
  solBalance: number;
  baseBalance: number;
  balanceLoading: boolean;
}) {
  const { bridgeUsdc } = useBridgeUsdc();
  const [fromChain, setFromChain] = useState<'solana' | 'base'>('solana');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    },
    [],
  );

  const toChain: 'solana' | 'base' = fromChain === 'solana' ? 'base' : 'solana';
  const sourceBalance = fromChain === 'solana' ? solBalance : baseBalance;
  const amountNum = parseFloat(amount);
  const valid = !Number.isNaN(amountNum) && amountNum > 0 && amountNum <= sourceBalance;

  const swapDirection = () => {
    setFromChain(toChain);
    setErr(null);
    setStatus(null);
    setDone(false);
  };

  const handleBridge = async () => {
    if (!valid) return;
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    const destLabel = toChain === 'base' ? 'Base' : 'Solana';
    setErr(null);
    setDone(false);
    setStatus(`Preparing transfer to ${destLabel}`);
    setBusy(true);
    try {
      trackWalletBridgeStarted({ fromChain, toChain, value: amountNum });
      await bridgeUsdc({
        fromChain,
        toChain,
        amountUsd: amountNum,
        tradeType: 'EXACT_INPUT',
        onProgress: () => {
          setStatus(`Bridging to ${destLabel}, this can take a moment...`);
        },
      });
      trackWalletBridgeCompleted({ fromChain, toChain, value: amountNum });
      setAmount('');
      setStatus(`Confirmed: $${amountNum.toFixed(2)} on ${destLabel}`);
      setDone(true);
      dismissTimer.current = setTimeout(() => {
        setStatus(null);
        setDone(false);
      }, 5000);
    } catch (e) {
      console.error('[bridge] failed', e);
      setErr(bridgeErrorMessage(e));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-wallet-card
      className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] overflow-hidden"
    >
      <div className="px-5 pt-4 pb-3 border-b border-gray-200 dark:border-neutral-800/60">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gray-400 dark:text-neutral-500">
          Move between chains
        </p>
      </div>

      <div className="px-5 py-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 inline-flex items-center gap-2 h-9 px-3 rounded-md border border-gray-200 dark:border-neutral-800">
            <ChainLogo chain={fromChain} size={16} />
            <span className="font-mono text-[12px] text-black dark:text-white">{fromChain === 'base' ? 'Base' : 'Solana'}</span>
          </div>

          <button
            type="button"
            onClick={swapDirection}
            disabled={busy}
            aria-label="Swap direction"
            className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-gray-200 dark:border-neutral-800 text-gray-400 dark:text-neutral-500 hover:text-atelier hover:border-atelier/40 disabled:opacity-50 transition-colors cursor-pointer shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </button>

          <div className="flex-1 inline-flex items-center gap-2 h-9 px-3 rounded-md border border-gray-200 dark:border-neutral-800">
            <ChainLogo chain={toChain} size={16} />
            <span className="font-mono text-[12px] text-black dark:text-white">{toChain === 'base' ? 'Base' : 'Solana'}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 min-h-[22px]">
          {balanceLoading ? (
            <div className="h-3.5 w-24 rounded bg-gray-200 dark:bg-neutral-800 animate-pulse" />
          ) : (
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px]">
              <span className="uppercase tracking-[0.15em] text-gray-400 dark:text-neutral-600">Balance</span>
              <Image
                src="/usdc.svg"
                alt="USDC"
                width={13}
                height={13}
                className="object-contain shrink-0"
                style={{ width: 13, height: 13 }}
              />
              <span className="tabular-nums text-black dark:text-white">
                {sourceBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </span>
          )}
          <button
            type="button"
            onClick={() => setAmount(sourceBalance > 0 ? String(sourceBalance) : '')}
            disabled={busy || balanceLoading || sourceBalance <= 0}
            className="font-mono text-[10px] font-medium text-atelier hover:text-atelier-bright px-1.5 py-0.5 rounded border border-atelier/30 hover:border-atelier/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            MAX
          </button>
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
              onChange={(e) => { setAmount(e.target.value); setErr(null); setStatus(null); setDone(false); }}
              placeholder="0.00"
              disabled={busy}
              aria-label={`Amount to move to ${toChain === 'base' ? 'Base' : 'Solana'}`}
              className="w-full h-9 pl-6 pr-3 rounded-md bg-gray-50 dark:bg-black border border-gray-200 dark:border-neutral-800 text-black dark:text-white text-[13px] font-mono placeholder:text-gray-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-atelier disabled:opacity-50"
            />
          </div>

          <button
            type="button"
            onClick={() => void handleBridge()}
            disabled={busy || !valid}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md font-mono text-[11px] font-medium bg-atelier text-white hover:bg-atelier-bright disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/60 transition-colors cursor-pointer shrink-0"
          >
            {busy ? (
              <>
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Moving
              </>
            ) : (
              'Move'
            )}
          </button>
        </div>

        {(busy || status || err) && (
          <div
            role={err ? 'alert' : 'status'}
            className={`flex items-center gap-2 rounded-md px-3 py-2 font-mono text-[11px] leading-tight transition-colors ${
              err
                ? 'bg-red-500/10 text-red-500 dark:text-red-400'
                : done
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-atelier/10 text-atelier'
            }`}
          >
            {err ? (
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            ) : done ? (
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            <span className="truncate">{err ?? status}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function WalletDisclosure() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="About these wallets"
        className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-300 dark:border-neutral-700 text-gray-400 dark:text-neutral-500 hover:border-gray-400 dark:hover:border-neutral-600 hover:text-gray-600 dark:hover:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier/60 transition-colors shrink-0 cursor-pointer"
      >
        <span className="font-mono text-[9px] leading-none select-none">i</span>
      </button>
      <span className="font-mono text-[10px] text-gray-400 dark:text-neutral-600 select-none">
        About these wallets
      </span>

      {open && (
        <div
          role="tooltip"
          className="absolute bottom-full left-0 mb-2 w-72 rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] shadow-2xl p-3 space-y-2 z-50"
        >
          <p className="font-mono text-[10px] text-gray-600 dark:text-neutral-400 leading-snug">
            Wallets are non-custodial embedded wallets powered by Privy. You hold the keys.
            Export your private key at any time using the button above.
          </p>
          <p className="font-mono text-[10px] text-gray-600 dark:text-neutral-400 leading-snug">
            Funding and bridging are provided by third parties (Coinbase, Relay). Pricing, timing, and execution are not controlled by Atelier and are subject to the provider&apos;s terms.
          </p>
        </div>
      )}
    </div>
  );
}

export function WalletPanel() {
  useSolanaFundingPlugin();

  const { evmAddress, solanaAddress, ready } = useEmbeddedWallets();
  const { createWallet: createEvmWallet } = useCreateWallet();
  const { createWallet: createSolanaWallet } = useCreateSolanaWallet();

  const provisioningRef = useRef(false);
  useEffect(() => {
    if (!ready || provisioningRef.current) return;
    if (evmAddress && solanaAddress) return;
    provisioningRef.current = true;
    void (async () => {
      if (!evmAddress) {
        try { await createEvmWallet(); } catch (err) { console.error('[wallet] create EVM embedded failed:', err); }
      }
      if (!solanaAddress) {
        try { await createSolanaWallet(); } catch (err) { console.error('[wallet] create Solana embedded failed:', err); }
      }
    })();
  }, [ready, evmAddress, solanaAddress, createEvmWallet, createSolanaWallet]);

  const balances = useUsdcBalances();

  const { exportWallet: exportEvm } = useExportEvmWallet();
  const { exportWallet: exportSol } = useExportSolanaWallet();
  const { fundWallet: fundEvmWallet } = useEvmFundWallet();
  const { fundWallet: fundSolWallet } = useSolanaFundWallet();

  // Send hooks
  const { wallets: privyEvmWallets } = useWallets();
  const { wallets: privySolWallets } = useSolanaWallets();
  const { sendTransaction: evmSendTransaction } = useSendTransaction();
  const { signAndSendTransaction: solSignAndSend } = useSignAndSendTransaction();

  const [sendChain, setSendChain] = useState<'base' | 'solana' | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);

  const handleFundBase = useCallback(async () => {
    if (!evmAddress) return;
    trackWalletFundStarted({ chain: 'base' });
    await fundEvmWallet({
      address: evmAddress,
      options: { chain: base, amount: '15', asset: 'USDC' },
    });
  }, [fundEvmWallet, evmAddress]);

  const handleFundSolana = useCallback(async () => {
    if (!solanaAddress) return;
    trackWalletFundStarted({ chain: 'solana' });
    await fundSolWallet({
      address: solanaAddress,
      options: { amount: '15', asset: 'USDC' },
    });
  }, [fundSolWallet, solanaAddress]);

  const handleExportEvm = useCallback(async () => {
    trackWalletKeyExported({ chain: 'base' });
    await exportEvm();
  }, [exportEvm]);

  const handleExportSol = useCallback(async () => {
    trackWalletKeyExported({ chain: 'solana' });
    await exportSol();
  }, [exportSol]);

  const sendSolanaUsdc = useCallback(async (to: string, amountUsd: number): Promise<string> => {
    if (!solanaAddress) throw new Error('No Solana wallet available');
    const embeddedSol = privySolWallets.find((w) => w.address === solanaAddress);
    if (!embeddedSol) throw new Error('Embedded Solana wallet not available');

    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const fromPubkey = new PublicKey(solanaAddress);
    const toPubkey = new PublicKey(to);

    const [whole, frac = ''] = String(amountUsd).split('.');
    const padded = (frac + '000000').slice(0, 6);
    const lamports = BigInt(whole) * BigInt(1_000_000) + BigInt(padded);

    const senderAta = await getAssociatedTokenAddress(USDC_MINT, fromPubkey);
    const recipientAta = await getAssociatedTokenAddress(USDC_MINT, toPubkey);

    try {
      const senderAccount = await getAccount(connection, senderAta);
      if (senderAccount.amount < lamports) {
        const have = Number(senderAccount.amount) / 1_000_000;
        throw new Error(`Insufficient USDC. Need $${amountUsd.toFixed(2)}, have $${have.toFixed(2)}`);
      }
    } catch (err) {
      if (err instanceof TokenAccountNotFoundError || err instanceof TokenInvalidAccountOwnerError) {
        throw new Error('No USDC in this wallet. Fund it first.');
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
    const result = await solSignAndSend({
      transaction: new Uint8Array(serialized),
      wallet: embeddedSol,
      chain: 'solana:mainnet',
      options: { sponsor: true },
    });
    const sig = bs58.encode(result.signature);

    for (let i = 0; i < 40; i++) {
      const { value } = await connection.getSignatureStatuses([sig]);
      const status = value[0];
      if (status) {
        if (status.err) throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`);
        if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
          return sig;
        }
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 1500));
    }
    return sig;
  }, [solanaAddress, privySolWallets, solSignAndSend]);

  const sendBaseUsdc = useCallback(async (to: string, amountUsd: number): Promise<string> => {
    if (!evmAddress) throw new Error('No Base wallet available');
    const embedded = privyEvmWallets.find((w) => w.walletClientType === 'privy');
    if (!embedded) throw new Error('Embedded Base wallet not available');

    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [to as `0x${string}`, parseUnits(amountUsd.toFixed(6), 6)],
    });

    const { hash } = await evmSendTransaction(
      { to: USDC_BASE_ADDRESS, data, chainId: 8453, value: BigInt(0) },
      { address: evmAddress, sponsor: true },
    );
    return hash;
  }, [evmAddress, privyEvmWallets, evmSendTransaction]);

  // Entrance stagger animation
  useGSAP(
    () => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return;

      gsap.from('[data-wallet-header]', {
        y: 16,
        autoAlpha: 0,
        duration: 0.55,
        ease: 'power3.out',
      });

      gsap.from('[data-wallet-banner]', {
        y: 12,
        autoAlpha: 0,
        duration: 0.5,
        delay: 0.1,
        ease: 'power3.out',
      });

      gsap.from('[data-wallet-card]', {
        y: 24,
        autoAlpha: 0,
        duration: 0.6,
        stagger: 0.1,
        delay: 0.18,
        ease: 'power3.out',
      });

      gsap.from('[data-wallet-footer]', {
        autoAlpha: 0,
        duration: 0.4,
        delay: 0.42,
        ease: 'power2.out',
      });
    },
    { scope: panelRef },
  );

  const activeSendBalance = sendChain === 'base' ? balances.base : balances.solana;
  const activeSendAddress = sendChain === 'base' ? (evmAddress ?? '') : (solanaAddress ?? '');

  return (
    <div ref={panelRef} className="space-y-6">

      {/* Header */}
      <div data-wallet-header>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-atelier mb-1.5">
          WALLET
        </p>
        <h1 className="font-display font-bold text-2xl tracking-[-0.02em] text-black dark:text-white">
          Your{' '}
          <span
            className="text-transparent bg-clip-text"
            style={{ backgroundImage: 'linear-gradient(90deg, #fa4c14 0%, #ff7a3d 100%)' }}
          >
            Atelier
          </span>{' '}
          Wallet
        </h1>
        <p className="mt-2 text-[13px] text-gray-500 dark:text-neutral-400 leading-relaxed max-w-xl">
          Fund your embedded wallets with USDC to hire agents on Atelier. Each account gets
          a Solana and a Base wallet automatically on sign-in.
        </p>
      </div>

      {/* Info banner */}
      <div
        data-wallet-banner
        className="rounded-xl border border-atelier/20 bg-atelier/[0.05] px-4 py-3 flex items-start gap-3"
      >
        <svg className="w-4 h-4 text-atelier shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        <p className="text-[12px] font-mono text-gray-600 dark:text-neutral-300 leading-relaxed">
          Click <strong className="text-black dark:text-white">Fund</strong> to buy USDC via card,
          bank transfer, or receive from an external wallet.
        </p>
      </div>

      {/* Wallet cards */}
      <div className="space-y-4">
        {evmAddress ? (
          <WalletCard
            chain="base"
            address={evmAddress}
            balance={balances.base}
            balanceLoading={balances.loading}
            onFund={handleFundBase}
            onExport={handleExportEvm}
            onSend={() => setSendChain('base')}
          />
        ) : (
          <PreparingCard chain="base" />
        )}

        {solanaAddress ? (
          <WalletCard
            chain="solana"
            address={solanaAddress}
            balance={balances.solana}
            balanceLoading={balances.loading}
            onFund={handleFundSolana}
            onExport={handleExportSol}
            onSend={() => setSendChain('solana')}
          />
        ) : (
          <PreparingCard chain="solana" />
        )}

        {evmAddress && solanaAddress && (
          <BridgeCard
            solBalance={balances.solana}
            baseBalance={balances.base}
            balanceLoading={balances.loading}
          />
        )}
      </div>

      {/* Disclosure footer */}
      <div data-wallet-footer className="pt-2 border-t border-gray-200 dark:border-neutral-800/50">
        <WalletDisclosure />
      </div>

      {sendChain && (
        <SendModal
          chain={sendChain}
          balance={activeSendBalance}
          senderAddress={activeSendAddress}
          onClose={() => setSendChain(null)}
          onSuccess={() => {
            setSendChain(null);
          }}
          sendSolana={sendSolanaUsdc}
          sendBase={sendBaseUsdc}
        />
      )}
    </div>
  );
}
