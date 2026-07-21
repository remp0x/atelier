'use client';

import { useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import type { StakeWalletMode } from './useStakeTxSender';

interface Props {
  mode: StakeWalletMode;
  onModeChange: (mode: StakeWalletMode) => void;
  embeddedAddress: string | null;
}

function shortAddress(addr: string): string {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

/**
 * Pick which wallet stakes: the Atelier embedded wallet or an external
 * Solana wallet (Wallet Standard: Phantom, Solflare, Backpack, ...).
 * Positions belong to whichever wallet signs, so switching wallets switches
 * the positions shown.
 */
export function WalletSelector({ mode, onModeChange, embeddedAddress }: Props) {
  const { wallets, wallet, select, connect, connected, connecting, publicKey, disconnect } =
    useWallet();

  useEffect(() => {
    if (mode !== 'external' || !wallet || connected || connecting) return;
    connect().catch(() => {
      // user rejected or wallet unavailable; the picker stays visible
    });
  }, [mode, wallet, connected, connecting, connect]);

  const detectable = wallets.filter(
    (w) => w.readyState === 'Installed' || w.readyState === 'Loadable',
  );

  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0d0d0d] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-neutral-600">
          Stake with
        </p>
        {mode === 'external' && connected && publicKey && (
          <button
            type="button"
            onClick={() => void disconnect()}
            className="font-mono text-[10px] text-gray-400 dark:text-neutral-500 hover:text-atelier transition-colors cursor-pointer"
          >
            Disconnect
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onModeChange('embedded')}
          className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-all cursor-pointer ${
            mode === 'embedded'
              ? 'border-atelier bg-atelier/8 dark:bg-atelier/10'
              : 'border-gray-200 dark:border-neutral-800 hover:border-atelier/40'
          }`}
        >
          <span className={`font-mono text-[11px] font-semibold ${mode === 'embedded' ? 'text-atelier' : 'text-black dark:text-white'}`}>
            Atelier Wallet
          </span>
          <span className="font-mono text-[10px] text-gray-400 dark:text-neutral-500">
            {embeddedAddress ? shortAddress(embeddedAddress) : 'Sign in to use'}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onModeChange('external')}
          className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-all cursor-pointer ${
            mode === 'external'
              ? 'border-atelier bg-atelier/8 dark:bg-atelier/10'
              : 'border-gray-200 dark:border-neutral-800 hover:border-atelier/40'
          }`}
        >
          <span className={`font-mono text-[11px] font-semibold ${mode === 'external' ? 'text-atelier' : 'text-black dark:text-white'}`}>
            External Wallet
          </span>
          <span className="font-mono text-[10px] text-gray-400 dark:text-neutral-500">
            {connected && publicKey ? shortAddress(publicKey.toBase58()) : 'Phantom, Solflare, ...'}
          </span>
        </button>
      </div>

      {mode === 'external' && !connected && (
        <div>
          {detectable.length === 0 ? (
            <p className="font-mono text-[11px] text-gray-400 dark:text-neutral-500 py-1">
              No Solana wallet detected. Install Phantom or Solflare, then reload.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {detectable.map((w) => (
                <button
                  key={w.adapter.name}
                  type="button"
                  disabled={connecting}
                  onClick={() => select(w.adapter.name)}
                  className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-gray-200 dark:border-neutral-800 hover:border-atelier/40 font-mono text-[11px] text-black dark:text-white disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={w.adapter.icon} alt="" className="w-4 h-4" />
                  {w.adapter.name}
                  {connecting && wallet?.adapter.name === w.adapter.name && (
                    <span className="w-3 h-3 rounded-full border border-atelier/30 border-t-atelier animate-spin" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
