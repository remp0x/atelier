'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import Image from 'next/image';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { useUsdcBalances } from '@/hooks/use-usdc-balances';

const POPOVER_WIDTH = 260;
const POPOVER_MARGIN = 8;

interface SignInButtonProps {
  expanded?: boolean;
  compact?: boolean;
  secondary?: boolean;
  hideWhen?: 'authenticated' | 'unauthenticated';
}

interface ProfileSnapshot {
  avatarUrl: string | null;
  displayName: string | null;
}

interface UserDisplay {
  label: string;
  avatarUrl: string | null;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function readPrivyPicture(user: ReturnType<typeof useAtelierAuth>['user']): string | null {
  if (!user) return null;
  const twitter = user.twitter as { profilePictureUrl?: string | null } | undefined;
  const google = user.google as { profilePictureUrl?: string | null } | undefined;
  return twitter?.profilePictureUrl || google?.profilePictureUrl || null;
}

function readPrivyLabel(user: ReturnType<typeof useAtelierAuth>['user']): string | null {
  if (!user) return null;
  const email = user.email?.address;
  const google = user.google?.email;
  const twitter = user.twitter?.username;
  if (twitter) return `@${twitter}`;
  if (google) return google;
  if (email) return email;
  return null;
}

function useProfileSnapshot(wallet: string | null): ProfileSnapshot {
  const [snapshot, setSnapshot] = useState<ProfileSnapshot>({ avatarUrl: null, displayName: null });

  useEffect(() => {
    if (!wallet) {
      setSnapshot({ avatarUrl: null, displayName: null });
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/profile?wallet=${wallet}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => {
        if (j?.success && j?.data) {
          setSnapshot({
            avatarUrl: j.data.avatar_url || null,
            displayName: j.data.display_name || null,
          });
        }
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [wallet]);

  return snapshot;
}

function resolveDisplay(
  auth: ReturnType<typeof useAtelierAuth>,
  profile: ProfileSnapshot,
): UserDisplay {
  const privyLabel = readPrivyLabel(auth.user);
  const privyPic = readPrivyPicture(auth.user);
  const walletLabel = auth.walletAddress ? truncateAddress(auth.walletAddress) : null;

  return {
    label: profile.displayName || privyLabel || walletLabel || 'Account',
    avatarUrl: profile.avatarUrl || privyPic || null,
  };
}

function GenericAvatar({ size = 28 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-gray-200 dark:bg-neutral-800 text-gray-400 dark:text-neutral-500 flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-[60%] h-[60%]">
        <path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.418 0-8 2.91-8 6.5V22h16v-1.5c0-3.59-3.582-6.5-8-6.5z" />
      </svg>
    </div>
  );
}

function Avatar({ url, size = 28, label }: { url: string | null; size?: number; label: string }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) return <GenericAvatar size={size} />;
  return (
    <img
      src={url}
      alt={label}
      width={size}
      height={size}
      className="rounded-full object-cover flex-shrink-0"
      style={{ width: size, height: size }}
      onError={() => setBroken(true)}
    />
  );
}

type PopoverPosition =
  | { placement: 'down'; left: number; top: number }
  | { placement: 'up'; left: number; bottom: number };

function computePosition(rect: DOMRect): PopoverPosition {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
  const maxLeft = Math.max(POPOVER_MARGIN, viewportWidth - POPOVER_WIDTH - POPOVER_MARGIN);
  const openDown = rect.top < viewportHeight / 2;
  if (openDown) {
    const preferredLeft = rect.right - POPOVER_WIDTH;
    const left = Math.min(Math.max(POPOVER_MARGIN, preferredLeft), maxLeft);
    return { placement: 'down', left, top: rect.bottom + POPOVER_MARGIN };
  }
  const preferredLeft = rect.left;
  const left = Math.min(Math.max(POPOVER_MARGIN, preferredLeft), maxLeft);
  return { placement: 'up', left, bottom: Math.max(POPOVER_MARGIN, viewportHeight - rect.top + POPOVER_MARGIN) };
}

function positionStyle(p: PopoverPosition): React.CSSProperties {
  if (p.placement === 'down') return { left: p.left, top: p.top, width: POPOVER_WIDTH };
  return { left: p.left, bottom: p.bottom, width: POPOVER_WIDTH };
}

function AccountDropdown({
  anchor,
  walletAddress,
  onClose,
  onLogout,
  baseUsdcBalance,
  balanceLoading,
}: {
  anchor: HTMLElement;
  walletAddress: string | null;
  onClose: () => void;
  onLogout: () => Promise<void>;
  baseUsdcBalance: number;
  balanceLoading: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    const updatePosition = () => setPosition(computePosition(anchor.getBoundingClientRect()));
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchor]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!dropdownRef.current) return;
      const target = e.target as Node;
      if (dropdownRef.current.contains(target) || anchor.contains(target)) return;
      onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [anchor, onClose]);

  if (!mounted || !position) return null;

  const content = (
    <div
      ref={dropdownRef}
      role="menu"
      className="fixed z-[100] rounded-xl bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-neutral-800 shadow-2xl overflow-hidden animate-slide-up"
      style={positionStyle(position)}
    >
      <Link
        href="/wallet"
        onClick={onClose}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-xs font-mono text-gray-700 dark:text-neutral-200 hover:bg-gray-100 dark:hover:bg-neutral-900 transition-colors cursor-pointer"
        role="menuitem"
      >
        <span className="flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
          </svg>
          Wallet
        </span>
        {balanceLoading ? (
          <span className="h-4 w-10 rounded bg-gray-100 dark:bg-neutral-800 animate-pulse" />
        ) : (
          <span className="flex items-center gap-1 font-mono text-[10px] text-gray-500 dark:text-neutral-400">
            <Image src="/usdc.svg" alt="USDC" width={12} height={12} className="h-3 w-3 object-contain" />
            {baseUsdcBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
          </span>
        )}
      </Link>
      {walletAddress && (
        <button
          onClick={() => { navigator.clipboard.writeText(walletAddress); onClose(); }}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-mono text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-900 transition-colors cursor-pointer"
          role="menuitem"
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
          </svg>
          Copy Address
        </button>
      )}
      <button
        onClick={async () => { onClose(); await onLogout(); }}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-mono text-red-500 hover:bg-gray-100 dark:hover:bg-neutral-900 transition-colors cursor-pointer"
        role="menuitem"
      >
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
        </svg>
        Sign Out
      </button>
    </div>
  );

  return createPortal(content, document.body);
}

export function SignInButton({ expanded = true, compact = false, secondary = false, hideWhen }: SignInButtonProps) {
  const auth = useAtelierAuth();
  const profile = useProfileSnapshot(auth.walletAddress);
  const balances = useUsdcBalances();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  if (hideWhen === 'authenticated' && auth.authenticated) return null;
  if (hideWhen === 'unauthenticated' && !auth.authenticated) return null;

  if (!auth.authenticated) {
    if (compact) {
      return (
        <button
          onClick={() => auth.login()}
          className="h-9 px-3.5 rounded-lg text-xs font-mono tracking-wide cursor-pointer transition-colors inline-flex items-center gap-1.5 border border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-500 hover:text-atelier hover:border-atelier/40 hover:bg-atelier/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-atelier/40"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5L21 3m0 0h-5.25M21 3v5.25M10.5 6H6.75A2.25 2.25 0 004.5 8.25v10.5A2.25 2.25 0 006.75 21h10.5a2.25 2.25 0 002.25-2.25V15" />
          </svg>
          Connect
        </button>
      );
    }
    if (!expanded) {
      return (
        <button
          onClick={() => auth.login()}
          className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors cursor-pointer text-atelier hover:text-atelier-bright focus:outline-none focus-visible:ring-2 focus-visible:ring-atelier/40"
          title="Connect"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5L21 3m0 0h-5.25M21 3v5.25M10.5 6H6.75A2.25 2.25 0 004.5 8.25v10.5A2.25 2.25 0 006.75 21h10.5a2.25 2.25 0 002.25-2.25V15" />
          </svg>
        </button>
      );
    }

    const fullClass = secondary
      ? 'w-full h-9 px-3 rounded-lg text-xs font-mono tracking-wide cursor-pointer transition-colors flex items-center justify-center gap-2 border border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-500 hover:text-atelier hover:border-atelier/40 hover:bg-atelier/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-atelier/40'
      : 'w-full h-10 px-3 rounded-lg text-xs font-semibold font-mono tracking-wide cursor-pointer transition-all flex items-center justify-center gap-2 text-white/90 bg-gradient-to-br from-[#7a2808] via-[#9a2906] to-[#c93a0a] hover:from-[#9a2906] hover:via-[#c93a0a] hover:to-[#fa4c14] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-atelier/40';
    return (
      <button
        onClick={() => auth.login()}
        className={fullClass}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5L21 3m0 0h-5.25M21 3v5.25M10.5 6H6.75A2.25 2.25 0 004.5 8.25v10.5A2.25 2.25 0 006.75 21h10.5a2.25 2.25 0 002.25-2.25V15" />
        </svg>
        Connect
      </button>
    );
  }

  const display = resolveDisplay(auth, profile);
  const handleLogout = async () => {
    await auth.logout();
  };

  if (!expanded) {
    return (
      <>
        <button
          ref={triggerRef}
          onClick={() => setDropdownOpen((v) => !v)}
          className="flex items-center justify-center w-9 h-9 rounded-full overflow-hidden transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-atelier/40"
          title={display.label}
          aria-haspopup="menu"
          aria-expanded={dropdownOpen}
        >
          <Avatar url={display.avatarUrl} size={32} label={display.label} />
        </button>
        {dropdownOpen && triggerRef.current && (
          <AccountDropdown
            anchor={triggerRef.current}
            walletAddress={auth.walletAddress}
            onClose={() => setDropdownOpen(false)}
            onLogout={handleLogout}
            baseUsdcBalance={balances.base}
            balanceLoading={balances.loading}
          />
        )}
      </>
    );
  }

  const totalUsdc = balances.base + balances.solana;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setDropdownOpen((v) => !v)}
        className="w-full h-10 pl-1.5 pr-3 rounded-full flex items-center gap-2 cursor-pointer transition-colors border border-gray-200 dark:border-neutral-800 hover:border-atelier/40 bg-white dark:bg-[#0a0a0a] focus:outline-none focus-visible:ring-2 focus-visible:ring-atelier/40"
        aria-haspopup="menu"
        aria-expanded={dropdownOpen}
      >
        <Avatar url={display.avatarUrl} size={28} label={display.label} />
        <span className="text-xs font-mono text-black dark:text-white truncate flex-1 text-left">{display.label}</span>
        {!balances.loading && (
          <span className="flex-shrink-0 flex items-center gap-1 font-mono text-[10px] text-gray-400 dark:text-neutral-500 bg-gray-100 dark:bg-neutral-900 px-1.5 py-0.5 rounded">
            <Image src="/usdc.svg" alt="USDC" width={10} height={10} className="h-2.5 w-2.5 object-contain" />
            {totalUsdc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )}
        <svg className="w-3.5 h-3.5 text-gray-400 dark:text-neutral-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {dropdownOpen && triggerRef.current && (
        <AccountDropdown
          anchor={triggerRef.current}
          walletAddress={auth.walletAddress}
          onClose={() => setDropdownOpen(false)}
          onLogout={handleLogout}
          baseUsdcBalance={balances.base}
          balanceLoading={balances.loading}
        />
      )}
    </>
  );
}
