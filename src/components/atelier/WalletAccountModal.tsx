'use client';

import { useEffect } from 'react';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { ChainLogo, chainLabel } from '@/components/atelier/ChainBadge';

interface WalletAccountModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  blurb?: string;
}

export function WalletAccountModal({
  open,
  onClose,
  title = 'Your Atelier wallets',
  blurb = 'Atelier gives every account a non-custodial wallet on Solana and Base. Pick which chain you want to use — payouts and payments run through it.',
}: WalletAccountModalProps): JSX.Element | null {
  const auth = useAtelierAuth();

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
              onSelect={() => auth.setActiveChain('solana')}
            />
            <ChainRow
              chain="base"
              address={auth.evmAddress}
              active={auth.walletChain === 'base'}
              onSelect={() => auth.setActiveChain('base')}
            />
          </div>

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
  onSelect,
}: {
  chain: 'solana' | 'base';
  address: string | null;
  active: boolean;
  onSelect: () => void;
}): JSX.Element {
  const label = chainLabel(chain);
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!address}
      className={`w-full flex items-center justify-between gap-3 px-3.5 py-3 text-left rounded-lg border transition-colors ${
        active
          ? 'border-atelier/70 bg-atelier/[0.08]'
          : 'border-gray-200 dark:border-neutral-800 hover:border-atelier/40'
      } ${address ? 'cursor-pointer' : 'cursor-default opacity-70'}`}
      aria-label={address ? `Use ${label}` : `${label} provisioning`}
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
            {address ?? 'provisioning…'}
          </div>
        </div>
      </div>
      {active && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4 text-atelier shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      )}
    </button>
  );
}
