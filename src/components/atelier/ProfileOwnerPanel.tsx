'use client';

import { useState, useCallback } from 'react';
import { usePrivy, useLinkAccount } from '@privy-io/react-auth';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { ProfileEditDrawer } from './ProfileEditDrawer';
import type { AtelierUser } from '@/lib/atelier-db';

interface ProfileOwnerPanelProps {
  user: AtelierUser;
}

function XIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
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

function WalletIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
    </svg>
  );
}

export function ProfileOwnerPanel({ user }: ProfileOwnerPanelProps): React.ReactElement | null {
  const { atelierUser, refreshAtelierUser, openWalletModal } = useAtelierAuth();
  const { user: privyUser, unlinkTwitter } = usePrivy();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { linkTwitter } = useLinkAccount({
    onSuccess: () => { void refreshAtelierUser(); },
  });

  const isOwner = atelierUser?.privy_user_id === user.privy_user_id;

  const linkedAccounts = privyUser?.linkedAccounts ?? [];
  const hasTwitter = linkedAccounts.some((a) => a.type === 'twitter_oauth');

  const handleUnlinkTwitter = useCallback(async () => {
    const twitterAccount = linkedAccounts.find((a) => a.type === 'twitter_oauth');
    if (!twitterAccount) return;
    const subject = (twitterAccount as { subject?: string }).subject;
    if (!subject) return;
    const confirmed = window.confirm('Disconnect X account from this profile?');
    if (!confirmed) return;
    try {
      await unlinkTwitter(subject);
      await refreshAtelierUser();
    } catch (err) {
      console.error('[ProfileOwnerPanel] unlinkTwitter failed:', err);
    }
  }, [linkedAccounts, unlinkTwitter, refreshAtelierUser]);

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

        <button
          type="button"
          onClick={openWalletModal}
          aria-label="Manage wallets"
          className={btnBase}
        >
          <WalletIcon className="w-3.5 h-3.5" />
          Manage wallets
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
            className={`${btnBase} text-emerald-400 hover:text-red-400 border-emerald-900/40 hover:border-red-900/60 hover:bg-red-900/10`}
          >
            <XIcon className="w-3.5 h-3.5" />
            X Connected
          </button>
        )}
      </div>

      <ProfileEditDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} user={user} />
    </>
  );
}
