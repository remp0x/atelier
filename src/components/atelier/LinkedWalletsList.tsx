'use client';

import { useState, useCallback } from 'react';
import Image from 'next/image';
import { useLinkAccount, usePrivy } from '@privy-io/react-auth';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { getPrivyAccessToken } from '@/lib/privy-client';
import type { UserWallet, WalletChain } from '@/lib/atelier-db';

interface LinkedWalletsListProps {
  wallets: UserWallet[];
  ownerPrivyUserId: string;
}

interface ChainConfig {
  id: WalletChain;
  label: string;
  logo: string;
  privyChainType: 'solana-only' | 'ethereum-only';
}

const CHAINS: readonly ChainConfig[] = [
  { id: 'solana', label: 'Solana', logo: '/solana.svg', privyChainType: 'solana-only' },
  { id: 'base', label: 'Base', logo: '/base.svg', privyChainType: 'ethereum-only' },
] as const;

function truncateAddress(address: string): string {
  if (address.startsWith('0x')) return `${address.slice(0, 6)}...${address.slice(-4)}`;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function PlusIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
    </svg>
  );
}

function DotsIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

interface LinkedRowProps {
  wallet: UserWallet;
  isOwner: boolean;
  onRefresh: () => Promise<void> | void;
}

function LinkedRow({ wallet, isOwner, onRefresh }: LinkedRowProps): React.ReactElement {
  const { unlinkWallet } = usePrivy();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const cfg = CHAINS.find((c) => c.id === wallet.chain);
  const logo = cfg?.logo ?? '/solana.svg';
  const label = cfg?.label ?? wallet.chain;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // silent
    }
  }, [wallet.address]);

  const handleMakePrimary = useCallback(async () => {
    setMenuOpen(false);
    const token = await getPrivyAccessToken();
    if (!token) return;
    try {
      await fetch(`/api/auth/wallets/${wallet.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_primary: true }),
      });
      await onRefresh();
    } catch (err) {
      console.error('[LinkedWalletsList] set primary failed:', err);
    }
  }, [wallet.id, onRefresh]);

  const handleUnlink = useCallback(async () => {
    setMenuOpen(false);
    const confirmed = window.confirm(`Unlink ${truncateAddress(wallet.address)}?`);
    if (!confirmed) return;
    try {
      await unlinkWallet(wallet.address);
    } catch {
      // continue regardless -- the DB delete is the source of truth for us
    }
    const token = await getPrivyAccessToken();
    if (!token) return;
    try {
      await fetch(`/api/auth/wallets/${wallet.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      await onRefresh();
    } catch (err) {
      console.error('[LinkedWalletsList] unlink failed:', err);
    }
  }, [wallet.address, wallet.id, unlinkWallet, onRefresh]);

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-black/40 border border-white/5">
      <Image src={logo} alt={`${label} logo`} width={20} height={20} className="flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-600">{label}</p>
        <code className="text-xs font-mono text-neutral-300 truncate block">{truncateAddress(wallet.address)}</code>
      </div>
      {wallet.is_primary === 1 && (
        <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-atelier/10 text-atelier border border-atelier/20 flex-shrink-0">
          Primary
        </span>
      )}
      {isOwner && (
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? 'Address copied' : 'Copy address'}
          className="p-2 rounded-lg text-neutral-500 hover:text-atelier hover:bg-atelier/5 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          {copied ? (
            <span className="text-[9px] font-mono uppercase tracking-widest text-emerald-400">Copied</span>
          ) : (
            <CopyIcon className="w-3.5 h-3.5" />
          )}
        </button>
      )}
      {isOwner && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Wallet actions"
            aria-expanded={menuOpen}
            className="p-2 rounded-lg text-neutral-500 hover:text-atelier hover:bg-atelier/5 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            <DotsIcon className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden="true" />
              <div className="absolute right-0 top-full mt-1.5 z-20 w-44 rounded-xl bg-[#0a0a0a] border border-neutral-800 shadow-xl overflow-hidden">
                {wallet.is_primary !== 1 && (
                  <button
                    type="button"
                    onClick={handleMakePrimary}
                    className="w-full text-left px-3 py-2.5 text-xs font-mono text-neutral-300 hover:bg-white/5 hover:text-white transition-colors duration-200 cursor-pointer"
                  >
                    Make primary
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleUnlink}
                  className="w-full text-left px-3 py-2.5 text-xs font-mono text-red-400 hover:bg-red-900/10 transition-colors duration-200 cursor-pointer"
                >
                  Unlink
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface PlaceholderRowProps {
  chain: ChainConfig;
  onClick: () => void;
}

function PlaceholderRow({ chain, onClick }: PlaceholderRowProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Connect ${chain.label} wallet`}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-black/20 border border-dashed border-neutral-800 hover:border-atelier/40 hover:bg-atelier/5 text-left transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier focus-visible:ring-offset-2 focus-visible:ring-offset-black"
    >
      <Image src={chain.logo} alt={`${chain.label} logo`} width={20} height={20} className="flex-shrink-0 opacity-60" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-600">{chain.label}</p>
        <p className="text-xs font-mono text-neutral-500">Tap to connect a {chain.label} wallet</p>
      </div>
      <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-atelier/10 text-atelier flex-shrink-0">
        <PlusIcon className="w-4 h-4" />
      </span>
    </button>
  );
}

export function LinkedWalletsList({ wallets, ownerPrivyUserId }: LinkedWalletsListProps): React.ReactElement | null {
  const { atelierUser, refreshAtelierUser } = useAtelierAuth();
  const { linkWallet } = useLinkAccount({
    onSuccess: () => { void refreshAtelierUser(); },
  });

  const isOwner = atelierUser?.privy_user_id === ownerPrivyUserId;

  const onRefresh = useCallback(async () => {
    await refreshAtelierUser();
  }, [refreshAtelierUser]);

  if (!isOwner && wallets.length === 0) return null;

  return (
    <div className="space-y-2">
      {CHAINS.map((chain) => {
        const chainWallets = wallets.filter((w) => w.chain === chain.id);
        if (chainWallets.length === 0) {
          if (!isOwner) return null;
          return (
            <PlaceholderRow
              key={chain.id}
              chain={chain}
              onClick={() => linkWallet({ walletChainType: chain.privyChainType })}
            />
          );
        }
        return chainWallets.map((w) => (
          <LinkedRow key={w.id} wallet={w} isOwner={isOwner} onRefresh={onRefresh} />
        ));
      })}
    </div>
  );
}
