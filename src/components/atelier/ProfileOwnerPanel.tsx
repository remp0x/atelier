'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { usePrivy, useLinkAccount } from '@privy-io/react-auth';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { ProfileEditDrawer } from './ProfileEditDrawer';
import type { AtelierUser, UserWallet } from '@/lib/atelier-db';

interface ProfileOwnerPanelProps {
  user: AtelierUser;
  wallets: UserWallet[];
}

function XIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function GoogleIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
    </svg>
  );
}

function WalletIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
    </svg>
  );
}

type WalletDropdownState = 'closed' | 'open';

export function ProfileOwnerPanel({ user, wallets }: ProfileOwnerPanelProps): React.ReactElement | null {
  const { atelierUser, refreshAtelierUser } = useAtelierAuth();
  const { user: privyUser, unlinkTwitter, unlinkGoogle } = usePrivy();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [walletDropdown, setWalletDropdown] = useState<WalletDropdownState>('closed');
  const walletDropdownRef = useRef<HTMLDivElement>(null);

  const { linkTwitter } = useLinkAccount({
    onSuccess: () => { void refreshAtelierUser(); },
  });
  const { linkGoogle } = useLinkAccount({
    onSuccess: () => { void refreshAtelierUser(); },
  });
  const { linkWallet } = useLinkAccount({
    onSuccess: () => { void refreshAtelierUser(); },
  });

  const isOwner = atelierUser?.privy_user_id === user.privy_user_id;

  const linkedAccounts = privyUser?.linkedAccounts ?? [];
  const hasTwitter = linkedAccounts.some((a) => a.type === 'twitter_oauth');
  const hasGoogle = linkedAccounts.some((a) => a.type === 'google_oauth');

  const hasSolana = wallets.some((w) => w.chain === 'solana');
  const hasBase = wallets.some((w) => w.chain === 'base');

  useEffect(() => {
    if (walletDropdown === 'closed') return;
    function handleClickOutside(e: MouseEvent): void {
      if (walletDropdownRef.current && !walletDropdownRef.current.contains(e.target as Node)) {
        setWalletDropdown('closed');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [walletDropdown]);

  const handleUnlinkTwitter = useCallback(async () => {
    const twitterAccount = linkedAccounts.find((a) => a.type === 'twitter_oauth');
    if (!twitterAccount) return;
    const subject = (twitterAccount as { subject?: string }).subject;
    if (!subject) return;
    try {
      await unlinkTwitter(subject);
      await refreshAtelierUser();
    } catch (err) {
      console.error('[ProfileOwnerPanel] unlinkTwitter failed:', err);
    }
  }, [linkedAccounts, unlinkTwitter, refreshAtelierUser]);

  const handleUnlinkGoogle = useCallback(async () => {
    const googleAccount = linkedAccounts.find((a) => a.type === 'google_oauth');
    if (!googleAccount) return;
    const subject = (googleAccount as { subject?: string }).subject;
    if (!subject) return;
    try {
      await unlinkGoogle(subject);
      await refreshAtelierUser();
    } catch (err) {
      console.error('[ProfileOwnerPanel] unlinkGoogle failed:', err);
    }
  }, [linkedAccounts, unlinkGoogle, refreshAtelierUser]);

  if (!isOwner) return null;

  const btnBase =
    'inline-flex items-center gap-2 h-9 px-3 rounded-lg text-xs font-mono text-neutral-300 bg-white/5 hover:bg-atelier/10 hover:text-atelier border border-neutral-800 hover:border-atelier/30 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier focus-visible:ring-offset-2 focus-visible:ring-offset-black';

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 pt-4 mt-2 border-t border-white/5">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Edit profile"
          className={btnBase}
        >
          <PencilIcon className="w-3.5 h-3.5" />
          Edit profile
        </button>

        {!hasTwitter && (
          <button
            type="button"
            onClick={() => void linkTwitter()}
            aria-label="Connect X account"
            className={btnBase}
          >
            <XIcon className="w-3.5 h-3.5" />
            Connect X
          </button>
        )}

        {hasTwitter && (
          <button
            type="button"
            onClick={handleUnlinkTwitter}
            aria-label="Disconnect X account"
            className={`${btnBase} text-green-400 hover:text-red-400 border-green-900 hover:border-red-900 hover:bg-red-900/10`}
          >
            <XIcon className="w-3.5 h-3.5" />
            X Connected
          </button>
        )}

        {!hasGoogle && (
          <button
            type="button"
            onClick={() => void linkGoogle()}
            aria-label="Connect Google account"
            className={btnBase}
          >
            <GoogleIcon className="w-3.5 h-3.5" />
            Connect Google
          </button>
        )}

        {hasGoogle && (
          <button
            type="button"
            onClick={handleUnlinkGoogle}
            aria-label="Disconnect Google account"
            className={`${btnBase} text-green-400 hover:text-red-400 border-green-900 hover:border-red-900 hover:bg-red-900/10`}
          >
            <GoogleIcon className="w-3.5 h-3.5" />
            Google Connected
          </button>
        )}

        <div className="relative" ref={walletDropdownRef}>
          <button
            type="button"
            onClick={() => setWalletDropdown((s) => s === 'closed' ? 'open' : 'closed')}
            aria-label="Link wallet"
            aria-expanded={walletDropdown === 'open'}
            className={btnBase}
          >
            <WalletIcon className="w-3.5 h-3.5" />
            Link wallet
            <svg className={`w-3 h-3 transition-transform duration-200 ${walletDropdown === 'open' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {walletDropdown === 'open' && (
            <div className="absolute left-0 top-full mt-1.5 z-20 w-44 rounded-xl bg-[#0a0a0a] border border-neutral-800 shadow-xl overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  setWalletDropdown('closed');
                  void linkWallet({ walletChainType: 'solana-only' });
                }}
                disabled={hasSolana}
                aria-label="Link Solana wallet"
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-mono text-neutral-300 hover:bg-white/5 hover:text-white transition-colors duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-left"
              >
                <img src="/solana.svg" alt="Solana" className="w-4 h-4 flex-shrink-0" />
                Solana
                {hasSolana && <span className="ml-auto text-[9px] text-green-400 uppercase tracking-wider font-mono">Linked</span>}
              </button>
              <button
                type="button"
                onClick={() => {
                  setWalletDropdown('closed');
                  void linkWallet({ walletChainType: 'ethereum-only' });
                }}
                disabled={hasBase}
                aria-label="Link Base wallet"
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-mono text-neutral-300 hover:bg-white/5 hover:text-white transition-colors duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-left"
              >
                <img src="/base.svg" alt="Base" className="w-4 h-4 flex-shrink-0" />
                Base
                {hasBase && <span className="ml-auto text-[9px] text-green-400 uppercase tracking-wider font-mono">Linked</span>}
              </button>
            </div>
          )}
        </div>
      </div>

      <ProfileEditDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} user={user} />
    </>
  );
}
