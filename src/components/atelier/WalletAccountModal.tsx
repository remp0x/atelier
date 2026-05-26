'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWallet, type Wallet } from '@solana/wallet-adapter-react';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { ChainLogo, chainLabel } from '@/components/atelier/ChainBadge';

interface WalletAccountModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  blurb?: string;
}

function getEthereumProvider(): {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
} | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
  };
  return w.ethereum ?? null;
}

export function WalletAccountModal({
  open,
  onClose,
  title = 'Connect & pick wallet',
  blurb = "Connect any wallet you own and pick the one you want to use. Wallets stay independent — switching here doesn't move data between accounts.",
}: WalletAccountModalProps): JSX.Element | null {
  const auth = useAtelierAuth();
  const solana = useWallet();
  const [busyChain, setBusyChain] = useState<'solana' | 'base' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [solanaPickerOpen, setSolanaPickerOpen] = useState(false);
  const [pendingSolanaConnect, setPendingSolanaConnect] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingSolanaConnect) return;
    const selectedName = solana.wallet?.adapter.name;
    if (selectedName !== pendingSolanaConnect) return;
    if (solana.connected || solana.connecting) {
      setPendingSolanaConnect(null);
      setBusyChain((b) => (b === 'solana' ? null : b));
      return;
    }
    setPendingSolanaConnect(null);
    solana.connect().catch((err: unknown) => {
      setActionError(err instanceof Error ? err.message : 'Could not connect Solana wallet.');
      setBusyChain((b) => (b === 'solana' ? null : b));
    });
  }, [pendingSolanaConnect, solana]);

  const installedSolanaWallets = useMemo(
    () => solana.wallets.filter((w) => w.readyState === WalletReadyState.Installed),
    [solana.wallets],
  );
  const loadableSolanaWallets = useMemo(
    () => solana.wallets.filter((w) => w.readyState === WalletReadyState.Loadable),
    [solana.wallets],
  );
  const pickableSolanaWallets = useMemo(
    () => [...installedSolanaWallets, ...loadableSolanaWallets],
    [installedSolanaWallets, loadableSolanaWallets],
  );

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

  const handleSolanaConnect = (wallet: Wallet): void => {
    setActionError(null);
    setBusyChain('solana');
    setSolanaPickerOpen(false);
    auth.setActiveChain('solana');

    const targetName = wallet.adapter.name;
    const alreadySelected = solana.wallet?.adapter.name === targetName;

    if (alreadySelected && !solana.connected && !solana.connecting) {
      solana.connect().catch((err: unknown) => {
        setActionError(err instanceof Error ? err.message : 'Could not connect Solana wallet.');
        setBusyChain(null);
      });
      return;
    }

    if (alreadySelected && solana.connected) {
      setBusyChain(null);
      return;
    }

    solana.select(targetName);
    setPendingSolanaConnect(targetName);
  };

  const handleSolanaConnectClick = (): void => {
    setActionError(null);
    if (pickableSolanaWallets.length === 0) {
      setActionError('No Solana wallet detected. Install Phantom or Solflare and reload.');
      return;
    }
    if (pickableSolanaWallets.length === 1) {
      handleSolanaConnect(pickableSolanaWallets[0]);
      return;
    }
    setSolanaPickerOpen((v) => !v);
  };

  const handleSolanaDisconnect = async (): Promise<void> => {
    setActionError(null);
    setBusyChain('solana');
    try {
      await solana.disconnect();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not disconnect Solana wallet.');
    } finally {
      setBusyChain(null);
    }
  };

  const handleEvmConnect = async (): Promise<void> => {
    setActionError(null);
    setBusyChain('base');
    auth.setActiveChain('base');
    const provider = getEthereumProvider();
    if (!provider) {
      setActionError('No EVM wallet detected. Install MetaMask, Rabby, or Coinbase Wallet.');
      setBusyChain(null);
      return;
    }
    try {
      auth.allowEvm();
      await provider.request({ method: 'eth_requestAccounts' });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not connect EVM wallet.');
    } finally {
      setBusyChain(null);
    }
  };

  const handleEvmDisconnect = async (): Promise<void> => {
    setActionError(null);
    setBusyChain('base');
    const provider = getEthereumProvider();
    try {
      if (provider) {
        try {
          await provider.request({
            method: 'wallet_revokePermissions',
            params: [{ eth_accounts: {} }],
          });
        } catch {
          // Wallet doesn't support EIP-2255; fall through to local-only disconnect.
        }
      }
      auth.disconnectEvm();
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
              address={auth.solanaAddress}
              active={auth.walletChain === 'solana'}
              busy={busyChain === 'solana'}
              onSelect={() => handleSelect('solana')}
              onConnect={() => handleSolanaConnectClick()}
              onDisconnect={() => void handleSolanaDisconnect()}
              pickerOpen={solanaPickerOpen}
              pickerWallets={pickableSolanaWallets}
              onPickWallet={(w) => handleSolanaConnect(w)}
            />
            <ChainRow
              chain="base"
              address={auth.evmAddress}
              active={auth.walletChain === 'base'}
              busy={busyChain === 'base'}
              onSelect={() => handleSelect('base')}
              onConnect={() => void handleEvmConnect()}
              onDisconnect={() => void handleEvmDisconnect()}
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
              No wallet connected. Click Connect on the chain you want to use.
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
  address,
  active,
  busy,
  onSelect,
  onConnect,
  onDisconnect,
  pickerOpen,
  pickerWallets,
  onPickWallet,
}: {
  chain: 'solana' | 'base';
  address: string | null;
  active: boolean;
  busy: boolean;
  onSelect: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  pickerOpen?: boolean;
  pickerWallets?: Wallet[];
  onPickWallet?: (wallet: Wallet) => void;
}): JSX.Element {
  const hasWallet = !!address;
  const label = chainLabel(chain);
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
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 shrink-0">
            <ChainLogo chain={chain} size={16} />
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
          {hasWallet ? 'Connect another' : 'Connect wallet'} →
        </button>
        {hasWallet && (
          <button
            type="button"
            onClick={onDisconnect}
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

      {pickerOpen && pickerWallets && pickerWallets.length > 0 && (
        <div className="px-3.5 pb-3 space-y-1">
          {pickerWallets.map((w) => (
            <button
              key={w.adapter.name}
              type="button"
              onClick={() => onPickWallet?.(w)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded border border-gray-200 dark:border-neutral-800 hover:border-atelier/50 hover:bg-atelier/[0.05] transition-colors text-left"
            >
              {w.adapter.icon && (
                <img src={w.adapter.icon} alt="" width={16} height={16} className="flex-shrink-0 rounded" />
              )}
              <span className="font-mono text-[11px] text-black dark:text-white">{w.adapter.name}</span>
            </button>
          ))}
        </div>
      )}

      {hasWallet && (
        <p className="px-3.5 pb-3 -mt-1 font-mono text-[10px] leading-[1.5] text-gray-500 dark:text-neutral-500">
          To use a different account inside the same extension, switch the active account there, or click Disconnect first.
        </p>
      )}
    </div>
  );
}
