'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { atelierHref } from '@/lib/atelier-paths';

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function getUserDisplayLabel(auth: ReturnType<typeof useAtelierAuth>): string {
  if (auth.user) {
    const email = auth.user.email?.address;
    if (email) return email;
    const google = auth.user.google?.email;
    if (google) return google;
    const twitter = auth.user.twitter?.username;
    if (twitter) return `@${twitter}`;
  }
  if (auth.walletAddress) return truncateAddress(auth.walletAddress);
  return 'Account';
}

interface SignInButtonProps {
  expanded?: boolean;
}

export function SignInButton({ expanded = true }: SignInButtonProps) {
  const auth = useAtelierAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  if (!auth.authenticated) {
    if (!expanded) {
      return (
        <button
          onClick={() => auth.login()}
          className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors cursor-pointer text-atelier hover:text-atelier-bright"
          title="Sign In"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
          </svg>
        </button>
      );
    }

    return (
      <div className="flex flex-col gap-1.5">
        <button
          onClick={() => auth.login()}
          className="w-full h-9 px-3 rounded-lg text-xs font-medium font-mono tracking-wide cursor-pointer transition-colors border border-atelier/40 text-atelier hover:bg-atelier hover:text-white hover:border-atelier"
        >
          Sign In
        </button>
        <Link
          href={atelierHref('/atelier/dashboard?tab=apikey')}
          className="text-[10px] font-mono text-gray-400 dark:text-neutral-500 hover:text-atelier transition-colors text-center"
        >
          Sign in with API key
        </Link>
      </div>
    );
  }

  const label = getUserDisplayLabel(auth);

  if (!expanded) {
    return (
      <div className="relative" ref={ref}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors cursor-pointer text-gray-400 dark:text-neutral-500 hover:text-gray-600 dark:hover:text-neutral-300"
          title={label}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
        </button>
        {dropdownOpen && (
          <div className="absolute bottom-full left-0 mb-1 w-40 bg-white dark:bg-black-soft border border-gray-200 dark:border-neutral-800 rounded-lg shadow-xl overflow-hidden z-50">
            {auth.walletAddress && (
              <button
                onClick={() => { navigator.clipboard.writeText(auth.walletAddress!); setDropdownOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-900 transition-colors cursor-pointer"
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                </svg>
                Copy Address
              </button>
            )}
            <button
              onClick={async () => { setDropdownOpen(false); await auth.logout(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono text-red-500 hover:bg-gray-100 dark:hover:bg-neutral-900 transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              Sign Out
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="w-full h-9 px-3 rounded-lg flex items-center justify-start cursor-pointer transition-colors text-xs font-mono border border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-400 hover:border-atelier/40 hover:text-black dark:hover:text-white"
      >
        <span className="truncate">{label}</span>
      </button>

      {dropdownOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-black-soft border border-gray-200 dark:border-neutral-800 rounded-lg shadow-xl overflow-hidden z-50">
          {auth.walletAddress && (
            <button
              onClick={() => { navigator.clipboard.writeText(auth.walletAddress!); setDropdownOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-900 transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
              </svg>
              Copy Address
            </button>
          )}
          <button
            onClick={async () => { setDropdownOpen(false); await auth.logout(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono text-red-500 hover:bg-gray-100 dark:hover:bg-neutral-900 transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
