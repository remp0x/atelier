'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { atelierHref } from '@/lib/atelier-paths';
import type { Notification } from '@/lib/atelier-db';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function TypeIcon({ type }: { type: string }) {
  if (type === 'order_delivered') {
    return (
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/10">
        <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    );
  }
  if (type === 'order_quoted') {
    return (
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-atelier/10">
        <svg className="w-4 h-4 text-atelier" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/10">
      <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    </div>
  );
}

const TYPE_LABELS: Record<string, string> = {
  order_delivered: 'Delivered',
  order_quoted: 'Quote',
  order_message: 'Message',
};

interface NotificationBellProps {
  compact?: boolean;
}

export function NotificationBell({ compact }: NotificationBellProps) {
  const { walletAddress, authenticated, getAuth } = useAtelierAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    if (!authenticated || !walletAddress) return;
    try {
      const auth = await getAuth();
      const params = new URLSearchParams({
        wallet: auth.wallet,
        wallet_sig: auth.wallet_sig,
        wallet_sig_ts: String(auth.wallet_sig_ts),
      });
      const res = await fetch(`/api/notifications?${params}`);
      const json = await res.json();
      if (json.success) {
        setNotifications(json.data);
        setUnreadCount(json.unread_count);
      }
    } catch {
      // silent
    }
  }, [walletAddress, getAuth]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const markAllRead = async () => {
    if (!authenticated || !walletAddress) return;
    setLoading(true);
    try {
      const auth = await getAuth();
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: auth.wallet,
          wallet_sig: auth.wallet_sig,
          wallet_sig_ts: auth.wallet_sig_ts,
        }),
      });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: 1 })));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  if (!authenticated || !walletAddress) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
        aria-expanded={open}
        className={`relative flex items-center justify-center rounded-lg transition-all text-gray-500 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-900 hover:text-black dark:hover:text-white ${
          compact ? 'w-8 h-8' : 'w-9 h-9'
        }`}
      >
        <svg className={compact ? 'w-4 h-4' : 'w-5 h-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold font-mono text-white bg-atelier rounded-full animate-fade-in">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-[22rem] bg-white dark:bg-black-soft border border-gray-200 dark:border-neutral-800 rounded-xl shadow-2xl overflow-hidden animate-fade-in"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-neutral-800">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-black dark:text-white font-display">Notifications</span>
              {unreadCount > 0 && (
                <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold font-mono text-white bg-atelier rounded-full">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                disabled={loading}
                className="text-xs font-mono text-atelier hover:text-atelier-bright transition-colors disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto overscroll-contain">
            {notifications.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <svg className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
                <p className="text-xs font-mono text-gray-400 dark:text-neutral-600">No notifications yet</p>
                <p className="text-[10px] font-mono text-gray-300 dark:text-neutral-700 mt-1">Order updates will appear here</p>
              </div>
            ) : (
              notifications.map((n) => (
                <Link
                  key={n.id}
                  href={n.order_id ? atelierHref(`/atelier/orders/${n.order_id}`) : '#'}
                  onClick={() => setOpen(false)}
                  className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-neutral-900/50 border-b border-gray-100 dark:border-neutral-800/50 last:border-0 ${
                    n.read === 0 ? 'bg-atelier/5' : ''
                  }`}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <TypeIcon type={n.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-mono uppercase tracking-wider ${
                        n.read === 0 ? 'text-atelier' : 'text-gray-400 dark:text-neutral-600'
                      }`}>
                        {TYPE_LABELS[n.type] || 'Update'}
                      </span>
                      <span className="text-[10px] font-mono text-gray-300 dark:text-neutral-700">
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                    <p className={`text-xs font-mono leading-relaxed ${
                      n.read === 0
                        ? 'text-black dark:text-white'
                        : 'text-gray-500 dark:text-neutral-400'
                    }`}>
                      {n.body || n.title}
                    </p>
                  </div>
                  {n.read === 0 && (
                    <span className="flex-shrink-0 w-2 h-2 rounded-full bg-atelier mt-2" />
                  )}
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
