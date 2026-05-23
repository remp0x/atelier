'use client';

import { useEffect, useState } from 'react';
import { useConnectWallet, usePrivy } from '@privy-io/react-auth';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';

interface WalletAccountModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  blurb?: string;
}

export function WalletAccountModal({
  open,
  onClose,
  title = 'Connect & pick wallet',
  blurb = "Connect any wallet you own and pick the one you want to use. Disconnect the ones you don't.",
}: WalletAccountModalProps): JSX.Element | null {
  const auth = useAtelierAuth();
  const { unlinkWallet } = usePrivy();
  const { connectWallet } = useConnectWallet();
  const [busyChain, setBusyChain] = useState<'solana' | 'base' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleSelect = (chain: 'solana' | 'base'): void => {
    auth.setActiveChain(chain);
  };

  const handleConnect = (chain: 'solana' | 'base'): void => {
    setActionError(null);
    setBusyChain(chain);
    auth.setActiveChain(chain);
    try {
      connectWallet({
        walletChainType: chain === 'solana' ? 'solana-only' : 'ethereum-only',
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not open wallet picker.');
    } finally {
      setBusyChain(null);
    }
  };

  const handleDisconnect = async (
    chain: 'solana' | 'base',
    address: string,
  ): Promise<void> => {
    setActionError(null);
    setBusyChain(chain);
    try {
      auth.clearAuth();
      await unlinkWallet(address);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not disconnect this wallet.';
      setActionError(
        /last/i.test(msg)
          ? "Privy won't let you unlink your last linked account. Link another login method first, or sign out."
          : msg,
      );
    } finally {
      setBusyChain(null);
    }
  };

  const handleSignOut = async (): Promise<void> => {
    onClose();
    await auth.logout();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-account-title"
      className="fixed inset-0 z-[120] flex items-center justify-center"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm cursor-default"
      />
      <div className="relative w-full max-w-[440px] mx-4 rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-black-soft shadow-2xl animate-slide-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 border-b border-gray-200 dark:border-neutral-800 sticky top-0 bg-white dark:bg-black-soft z-10">
          <div>
            <p
              id="wallet-account-title"
              className="font-mono text-[10px] tracking-[0.18em] text-atelier mb-1"
            >
              WALLETS
            </p>
            <h3 className="font-display font-bold text-base tracking-[-0.02em] text-black dark:text-white">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 w-7 h-7 rounded-md inline-flex items-center justify-center text-gray-500 dark:text-neutral-400 hover:text-atelier hover:bg-gray-100 dark:hover:bg-neutral-900 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-[12.5px] leading-[1.5] text-gray-600 dark:text-neutral-400">{blurb}</p>

          <div className="space-y-3">
            <ChainRow
              chain="solana"
              label="Solana"
              address={auth.solanaAddress}
              active={auth.walletChain === 'solana'}
              busy={busyChain === 'solana'}
              onSelect={() => handleSelect('solana')}
              onConnect={() => handleConnect('solana')}
              onDisconnect={(addr) => void handleDisconnect('solana', addr)}
            />
            <ChainRow
              chain="base"
              label="Base"
              address={auth.evmAddress}
              active={auth.walletChain === 'base'}
              busy={busyChain === 'base'}
              onSelect={() => handleSelect('base')}
              onConnect={() => handleConnect('base')}
              onDisconnect={(addr) => void handleDisconnect('base', addr)}
            />
          </div>

          {actionError && (
            <div
              role="alert"
              className="px-3 py-2 rounded-md border border-red-500/50 bg-red-500/[0.08] font-mono text-[11px] leading-[1.5] text-red-600 dark:text-red-300"
            >
              {actionError}
            </div>
          )}

          {!auth.solanaAddress && !auth.evmAddress && (
            <p className="text-[11.5px] font-mono leading-[1.5] text-amber-600 dark:text-amber-400">
              No wallet detected yet. Connect one above, or wait a few seconds if you logged in with email and Privy is still provisioning an embedded wallet.
            </p>
          )}

          <div className="pt-3 border-t border-gray-200 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 font-mono text-[11.5px] hover:border-red-500/50 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            >
              Sign out of Atelier
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChainRow({
  chain,
  label,
  address,
  active,
  busy,
  onSelect,
  onConnect,
  onDisconnect,
}: {
  chain: 'solana' | 'base';
  label: string;
  address: string | null;
  active: boolean;
  busy: boolean;
  onSelect: () => void;
  onConnect: () => void;
  onDisconnect: (address: string) => void;
}): JSX.Element {
  const hasWallet = !!address;
  return (
    <div
      className={`rounded-lg border transition-colors ${
        active
          ? 'border-atelier/70 bg-atelier/[0.08]'
          : 'border-gray-200 dark:border-neutral-800'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={!hasWallet}
        className={`w-full flex items-center justify-between gap-3 px-3.5 py-3 text-left rounded-lg ${
          hasWallet ? 'cursor-pointer' : 'cursor-default'
        }`}
        aria-label={hasWallet ? `Use ${label}` : `${label} not connected`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`inline-flex items-center justify-center w-7 h-7 rounded-full font-mono text-[10px] tracking-wide shrink-0 ${
              chain === 'solana'
                ? 'bg-[#9945FF]/15 text-[#c084fc] border border-[#9945FF]/40'
                : 'bg-[#0052FF]/15 text-[#5b8dff] border border-[#0052FF]/40'
            }`}
          >
            {chain === 'solana' ? 'SOL' : 'BASE'}
          </span>
          <div className="min-w-0">
            <div className="font-display font-semibold text-[13px] text-black dark:text-white leading-tight">
              {label}
            </div>
            <div className="font-mono text-[10.5px] text-gray-500 dark:text-neutral-400 truncate">
              {address ?? 'not connected'}
            </div>
          </div>
        </div>
        {active && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4 text-atelier shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        )}
      </button>

      <div className="flex items-center gap-1.5 px-3.5 pb-3 -mt-1">
        <button
          type="button"
          onClick={onConnect}
          disabled={busy}
          className={`inline-flex items-center gap-1 h-7 px-2.5 rounded font-mono text-[10.5px] tracking-wide border transition-colors ${
            busy
              ? 'border-atelier/30 text-atelier/60 cursor-wait'
              : 'border-atelier/40 text-atelier hover:bg-atelier hover:text-white hover:border-atelier'
          }`}
        >
          {hasWallet ? 'Switch wallet' : 'Connect wallet'} →
        </button>
        {hasWallet && (
          <button
            type="button"
            onClick={() => onDisconnect(address)}
            disabled={busy}
            className={`inline-flex items-center h-7 px-2.5 rounded font-mono text-[10.5px] tracking-wide border transition-colors ${
              busy
                ? 'border-gray-200 dark:border-neutral-800 text-gray-400 cursor-wait'
                : 'border-gray-200 dark:border-neutral-700 text-gray-500 dark:text-neutral-400 hover:border-red-500/50 hover:text-red-500 dark:hover:text-red-400'
            }`}
          >
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}
