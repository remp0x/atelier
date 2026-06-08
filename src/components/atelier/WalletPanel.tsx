'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useExportWallet as useExportEvmWallet, useCreateWallet } from '@privy-io/react-auth';
import { useFundWallet as useEvmFundWallet } from '@privy-io/react-auth';
import {
  useExportWallet as useExportSolanaWallet,
  useFundWallet as useSolanaFundWallet,
  useSolanaFundingPlugin,
  useCreateWallet as useCreateSolanaWallet,
} from '@privy-io/react-auth/solana';
import { base } from 'viem/chains';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
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

interface WalletCardProps {
  chain: 'base' | 'solana';
  address: string;
  balance: number;
  balanceLoading: boolean;
  onFund: () => Promise<void>;
  onExport: () => Promise<void>;
}

function WalletCard({
  chain,
  address,
  balance,
  balanceLoading,
  onFund,
  onExport,
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

        {/* Address block -- the hero */}
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gray-400 dark:text-neutral-500 mb-1">
            {chainLabel}
          </p>
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="font-mono text-[13px] text-black dark:text-white leading-tight truncate"
              title={address}
            >
              {/* Show more chars on wider screens via CSS -- middle ellipsis in JS for mobile */}
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
  const [err, setErr] = useState<string | null>(null);

  const toChain: 'solana' | 'base' = fromChain === 'solana' ? 'base' : 'solana';
  const sourceBalance = fromChain === 'solana' ? solBalance : baseBalance;
  const amountNum = parseFloat(amount);
  const valid = !Number.isNaN(amountNum) && amountNum > 0 && amountNum <= sourceBalance;

  const swapDirection = () => {
    setFromChain(toChain);
    setErr(null);
    setStatus(null);
  };

  const handleBridge = async () => {
    if (!valid) return;
    setErr(null);
    setStatus(`Moving to ${toChain === 'base' ? 'Base' : 'Solana'}...`);
    setBusy(true);
    try {
      trackWalletBridgeStarted({ fromChain, toChain, value: amountNum });
      await bridgeUsdc({
        fromChain,
        toChain,
        amountUsd: amountNum,
        tradeType: 'EXACT_INPUT',
        onProgress: (data) => {
          const step = data.currentStep;
          const label = step?.description || step?.action;
          if (label) setStatus(label);
        },
      });
      trackWalletBridgeCompleted({ fromChain, toChain, value: amountNum });
      setStatus(`Moved $${amountNum.toFixed(2)} USDC to ${toChain === 'base' ? 'Base' : 'Solana'}.`);
      setAmount('');
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

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setErr(null); setStatus(null); }}
              placeholder="0.00"
              disabled={busy}
              className="w-full h-9 pl-3 pr-14 rounded-md bg-gray-50 dark:bg-black border border-gray-200 dark:border-neutral-800 text-black dark:text-white text-[13px] font-mono placeholder:text-gray-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-atelier disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setAmount(sourceBalance > 0 ? String(sourceBalance) : '')}
              disabled={busy || balanceLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-atelier hover:text-atelier-bright disabled:opacity-50 cursor-pointer"
            >
              MAX
            </button>
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
                Moving...
              </>
            ) : (
              'Move'
            )}
          </button>
        </div>

        <p className="font-mono text-[10px] text-gray-400 dark:text-neutral-500">
          {balanceLoading
            ? 'Loading balance...'
            : `Available on ${fromChain === 'base' ? 'Base' : 'Solana'}: $${sourceBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`}
        </p>

        {status && (
          <p className="font-mono text-[11px] text-atelier">{status}</p>
        )}
        {err && (
          <p role="alert" className="font-mono text-[11px] text-red-400">{err}</p>
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
    </div>
  );
}
