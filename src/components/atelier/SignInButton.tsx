'use client';

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';

const POPOVER_WIDTH = 260;
const POPOVER_MARGIN = 8;

interface SignInButtonProps {
  expanded?: boolean;
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
  if (auth.apiKeySession) {
    return {
      label: auth.apiKeySession.agentName || `Agent ${auth.apiKeySession.agentId.slice(-4)}`,
      avatarUrl: auth.apiKeySession.agentAvatarUrl || null,
    };
  }

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

type PopoverView = 'menu' | 'apikey';

interface PopoverPosition {
  left: number;
  bottom: number;
}

function computePosition(rect: DOMRect): PopoverPosition {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
  const preferredLeft = rect.left;
  const maxLeft = viewportWidth - POPOVER_WIDTH - POPOVER_MARGIN;
  const left = Math.min(Math.max(POPOVER_MARGIN, preferredLeft), Math.max(POPOVER_MARGIN, maxLeft));
  const bottom = Math.max(POPOVER_MARGIN, viewportHeight - rect.top + POPOVER_MARGIN);
  return { left, bottom };
}

function ConnectPopover({
  anchor,
  view,
  onClose,
  onSocialLogin,
  onApiKeySubmit,
  onBack,
  onSwitchToApiKey,
}: {
  anchor: HTMLElement;
  view: PopoverView;
  onClose: () => void;
  onSocialLogin: () => void;
  onApiKeySubmit: (key: string) => Promise<void>;
  onBack: () => void;
  onSwitchToApiKey: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (view === 'apikey') {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [view]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!popoverRef.current) return;
      const target = e.target as Node;
      if (popoverRef.current.contains(target) || anchor.contains(target)) return;
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

  const handleSubmit = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    setValidating(true);
    setError(null);
    try {
      await onApiKeySubmit(trimmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid API key');
    } finally {
      setValidating(false);
    }
  };

  if (!mounted || !position) return null;

  const content = (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Connect"
      className="fixed z-[100] rounded-xl bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-neutral-800 shadow-2xl overflow-hidden animate-slide-up"
      style={{ left: position.left, bottom: position.bottom, width: POPOVER_WIDTH }}
    >
      {view === 'menu' ? (
        <div className="p-1.5">
          <button
            onClick={onSocialLogin}
            className="w-full flex items-start gap-3 px-3 py-3 rounded-lg text-left transition-colors hover:bg-gray-100 dark:hover:bg-neutral-900 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-atelier/40"
          >
            <div className="w-9 h-9 rounded-lg bg-atelier/10 text-atelier flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-mono font-semibold text-black dark:text-white">Social / Crypto Login</div>
              <div className="text-[10px] font-mono text-gray-500 dark:text-neutral-500 mt-0.5">Wallet, email, Google or X</div>
            </div>
          </button>

          <button
            onClick={onSwitchToApiKey}
            className="w-full flex items-start gap-3 px-3 py-3 rounded-lg text-left transition-colors hover:bg-gray-100 dark:hover:bg-neutral-900 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-atelier/40"
          >
            <div className="w-9 h-9 rounded-lg bg-atelier/10 text-atelier flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-mono font-semibold text-black dark:text-white">Agent API Key</div>
              <div className="text-[10px] font-mono text-gray-500 dark:text-neutral-500 mt-0.5">Paste your atelier_... key</div>
            </div>
          </button>
        </div>
      ) : (
        <div className="p-3 space-y-3">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 dark:text-neutral-500 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-neutral-900 transition-colors cursor-pointer"
              aria-label="Back"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400">Agent API Key</span>
          </div>
          <div>
            <label htmlFor="atelier-api-key" className="sr-only">API Key</label>
            <input
              id="atelier-api-key"
              ref={inputRef}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              placeholder="atelier_..."
              className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-black border border-gray-200 dark:border-neutral-800 text-black dark:text-white text-sm font-mono placeholder:text-gray-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-atelier transition-colors"
            />
          </div>
          {error && <p className="text-[11px] font-mono text-red-500 dark:text-red-400">{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={validating || !apiKey.trim()}
            className="w-full py-2 rounded-lg border border-atelier text-atelier text-xs font-mono font-semibold transition-colors hover:bg-atelier hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {validating ? 'Validating...' : 'Sign In'}
          </button>
          <p className="text-[10px] font-mono text-gray-400 dark:text-neutral-600 text-center">
            You received your key when you registered your agent
          </p>
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
}

function AccountDropdown({
  anchor,
  walletAddress,
  onClose,
  onLogout,
}: {
  anchor: HTMLElement;
  walletAddress: string | null;
  onClose: () => void;
  onLogout: () => Promise<void>;
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
      style={{ left: position.left, bottom: position.bottom, width: POPOVER_WIDTH }}
    >
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

export function SignInButton({ expanded = true }: SignInButtonProps) {
  const auth = useAtelierAuth();
  const profile = useProfileSnapshot(auth.walletAddress);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [view, setView] = useState<PopoverView>('menu');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const closePopover = useCallback(() => {
    setPopoverOpen(false);
    setView('menu');
  }, []);

  const handleSocialLogin = useCallback(() => {
    closePopover();
    auth.login();
  }, [auth, closePopover]);

  const handleApiKeySubmit = useCallback(async (key: string) => {
    await auth.loginWithApiKey(key);
    closePopover();
  }, [auth, closePopover]);

  if (!auth.authenticated) {
    if (!expanded) {
      return (
        <>
          <button
            ref={triggerRef}
            onClick={() => setPopoverOpen((v) => !v)}
            className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors cursor-pointer text-atelier hover:text-atelier-bright focus:outline-none focus-visible:ring-2 focus-visible:ring-atelier/40"
            title="Connect"
            aria-haspopup="dialog"
            aria-expanded={popoverOpen}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5L21 3m0 0h-5.25M21 3v5.25M10.5 6H6.75A2.25 2.25 0 004.5 8.25v10.5A2.25 2.25 0 006.75 21h10.5a2.25 2.25 0 002.25-2.25V15" />
            </svg>
          </button>
          {popoverOpen && triggerRef.current && (
            <ConnectPopover
              anchor={triggerRef.current}
              view={view}
              onClose={closePopover}
              onSocialLogin={handleSocialLogin}
              onApiKeySubmit={handleApiKeySubmit}
              onBack={() => setView('menu')}
              onSwitchToApiKey={() => setView('apikey')}
            />
          )}
        </>
      );
    }

    return (
      <>
        <button
          ref={triggerRef}
          onClick={() => setPopoverOpen((v) => !v)}
          className="w-full h-10 px-3 rounded-lg text-xs font-semibold font-mono tracking-wide cursor-pointer transition-all flex items-center justify-center gap-2 bg-atelier text-white hover:bg-atelier-bright shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-atelier/40"
          aria-haspopup="dialog"
          aria-expanded={popoverOpen}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5L21 3m0 0h-5.25M21 3v5.25M10.5 6H6.75A2.25 2.25 0 004.5 8.25v10.5A2.25 2.25 0 006.75 21h10.5a2.25 2.25 0 002.25-2.25V15" />
          </svg>
          Connect
        </button>
        {popoverOpen && triggerRef.current && (
          <ConnectPopover
            anchor={triggerRef.current}
            view={view}
            onClose={closePopover}
            onSocialLogin={handleSocialLogin}
            onApiKeySubmit={handleApiKeySubmit}
            onBack={() => setView('menu')}
            onSwitchToApiKey={() => setView('apikey')}
          />
        )}
      </>
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
          />
        )}
      </>
    );
  }

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
        />
      )}
    </>
  );
}
