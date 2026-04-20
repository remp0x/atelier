'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { atelierHref } from '@/lib/atelier-paths';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import type { ServiceOrder, OrderStatus } from '@/lib/atelier-db';

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_quote: 'Pending Quote',
  quoted: 'Quoted',
  accepted: 'Accepted',
  paid: 'Paid',
  in_progress: 'In Progress',
  delivered: 'Delivered',
  revision_requested: 'Revision Requested',
  completed: 'Completed',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<string, string> = {
  pending_quote: 'bg-gray-200 dark:bg-neutral-800 text-gray-600 dark:text-neutral-400',
  quoted: 'bg-atelier/10 text-atelier',
  accepted: 'bg-atelier/10 text-atelier',
  paid: 'bg-atelier/20 text-atelier',
  in_progress: 'bg-amber-400/10 text-amber-400',
  delivered: 'bg-emerald-400/10 text-emerald-400',
  revision_requested: 'bg-amber-400/20 text-amber-400',
  completed: 'bg-emerald-400/20 text-emerald-400',
  disputed: 'bg-red-400/10 text-red-400',
  cancelled: 'bg-red-400/10 text-red-400',
};

type FilterTab = 'all' | 'active' | 'delivered' | 'completed';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'completed', label: 'Completed' },
];

const ACTIVE_STATUSES: OrderStatus[] = ['pending_quote', 'quoted', 'accepted', 'paid', 'in_progress', 'revision_requested'];
const DELIVERED_STATUSES: OrderStatus[] = ['delivered'];
const COMPLETED_STATUSES: OrderStatus[] = ['completed', 'cancelled', 'disputed'];

const NEEDS_ACTION_STATUSES: OrderStatus[] = ['delivered', 'quoted'];

function filterOrders(orders: ServiceOrder[], tab: FilterTab): ServiceOrder[] {
  switch (tab) {
    case 'active': return orders.filter(o => ACTIVE_STATUSES.includes(o.status));
    case 'delivered': return orders.filter(o => DELIVERED_STATUSES.includes(o.status));
    case 'completed': return orders.filter(o => COMPLETED_STATUSES.includes(o.status));
    default: return orders;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function MyOrdersPage() {
  return (
    <AtelierAppLayout>
      <OrdersContent />
    </AtelierAppLayout>
  );
}

function OrdersContent() {
  const { walletAddress, authenticated, sessionReady, login } = useAtelierAuth();
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const fetchOrders = useCallback(async () => {
    if (!authenticated || !walletAddress) {
      setOrders([]);
      return;
    }

    setLoading(true);
    setAuthError(false);
    try {
      const res = await fetch('/api/orders', { credentials: 'include' });
      const json = await res.json();
      if (json.success) setOrders(json.data);
      else if (res.status === 401) setAuthError(true);
    } catch {
      setAuthError(true);
    } finally {
      setLoading(false);
    }
  }, [authenticated, walletAddress]);

  useEffect(() => {
    if (!authenticated || !walletAddress) return;
    if (!sessionReady) {
      setLoading(true);
      return;
    }
    fetchOrders();
  }, [authenticated, walletAddress, sessionReady, fetchOrders]);

  const filtered = filterOrders(orders, activeTab);
  const tabCounts: Record<FilterTab, number> = {
    all: orders.length,
    active: orders.filter(o => ACTIVE_STATUSES.includes(o.status)).length,
    delivered: orders.filter(o => DELIVERED_STATUSES.includes(o.status)).length,
    completed: orders.filter(o => COMPLETED_STATUSES.includes(o.status)).length,
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-black dark:text-white font-display">My Orders</h1>
        <p className="text-sm text-gray-500 dark:text-neutral-500 mt-1">
          Track and manage your service orders
        </p>
      </div>

      {!authenticated || !walletAddress ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-full bg-atelier/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-atelier" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
            </svg>
          </div>
          <p className="text-gray-500 dark:text-neutral-500 font-mono text-sm mb-4">
            Sign in to view orders
          </p>
          <button
            onClick={() => login()}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold font-mono text-white transition-colors cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #fa4c14 0%, #ff7a3d 100%)' }}
          >
            Sign In
          </button>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
        </div>
      ) : authError ? (
        <div className="text-center py-20">
          <p className="text-gray-500 dark:text-neutral-500 font-mono text-sm mb-4">
            Wallet signature required to view orders
          </p>
          <button
            onClick={fetchOrders}
            className="text-sm font-mono text-atelier hover:text-atelier-bright transition-colors cursor-pointer"
          >
            Try again →
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-900 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-gray-400 dark:text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
          </div>
          <p className="text-gray-500 dark:text-neutral-400 font-mono text-sm mb-1">No orders yet</p>
          <p className="text-gray-400 dark:text-neutral-600 text-xs mb-4">Hire an AI agent to get started</p>
          <Link
            href={atelierHref('/atelier/agents')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded border border-atelier text-atelier text-sm font-mono font-medium hover:bg-atelier hover:text-white transition-all duration-200"
          >
            Browse Agents
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      ) : (
        <>
          {/* Filter tabs */}
          <div className="flex items-center gap-1 mb-5 border-b border-gray-200 dark:border-neutral-800">
            {FILTER_TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-3 py-2 text-xs font-mono font-medium border-b-2 transition-colors cursor-pointer ${
                  activeTab === key
                    ? 'border-atelier text-atelier'
                    : 'border-transparent text-gray-500 dark:text-neutral-500 hover:text-black dark:hover:text-white'
                }`}
              >
                {label}
                {tabCounts[key] > 0 && (
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-2xs ${
                    activeTab === key
                      ? 'bg-atelier/10 text-atelier'
                      : 'bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-neutral-500'
                  }`}>
                    {tabCounts[key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400 dark:text-neutral-600 font-mono text-sm">
                No {activeTab === 'all' ? '' : activeTab} orders
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((order) => {
                const needsAction = NEEDS_ACTION_STATUSES.includes(order.status);
                return (
                  <Link
                    key={order.id}
                    href={atelierHref(`/atelier/orders/${order.id}`)}
                    className={`block rounded-lg bg-gray-50 dark:bg-black-soft border transition-colors ${
                      needsAction
                        ? 'border-atelier/30 hover:border-atelier/60'
                        : 'border-gray-200 dark:border-neutral-800 hover:border-atelier/40'
                    }`}
                  >
                    <div className="flex gap-4 p-4">
                      {/* Deliverable thumbnail */}
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg bg-gray-100 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 overflow-hidden shrink-0">
                        {order.deliverable_url ? (
                          order.deliverable_media_type === 'video' ? (
                            <div className="w-full h-full flex items-center justify-center">
                              <svg className="w-6 h-6 text-gray-400 dark:text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                              </svg>
                            </div>
                          ) : order.deliverable_media_type === 'image' || !order.deliverable_media_type ? (
                            <img
                              src={order.deliverable_url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : order.deliverable_media_type === 'link' ? (
                            <div className="w-full h-full flex items-center justify-center">
                              <svg className="w-6 h-6 text-atelier-bright/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.03a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.374" />
                              </svg>
                            </div>
                          ) : order.deliverable_media_type === 'code' ? (
                            <div className="w-full h-full flex items-center justify-center">
                              <svg className="w-6 h-6 text-atelier-bright/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                              </svg>
                            </div>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <svg className="w-6 h-6 text-atelier-bright/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                              </svg>
                            </div>
                          )
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <svg className="w-5 h-5 text-gray-300 dark:text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Order info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <h3 className="font-semibold text-black dark:text-white font-display truncate">
                            {order.service_title}
                          </h3>
                          <div className="flex items-center gap-2 shrink-0">
                            {needsAction && (
                              <span className="w-2 h-2 rounded-full bg-atelier animate-pulse shrink-0" />
                            )}
                            <span className={`px-2.5 py-0.5 rounded-full text-2xs font-mono font-medium whitespace-nowrap ${STATUS_COLORS[order.status] || ''}`}>
                              {STATUS_LABELS[order.status] || order.status}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs font-mono text-gray-500 dark:text-neutral-500">
                          <span>{formatDate(order.created_at)}</span>
                          {order.quoted_price_usd && (
                            <span className="text-atelier font-medium">${order.quoted_price_usd}</span>
                          )}
                          <span className="truncate">by {order.provider_name}</span>
                        </div>
                        {needsAction && (
                          <p className="text-2xs font-mono text-atelier mt-1.5">
                            {order.status === 'delivered' ? 'Ready for review — approve or request revision' : 'Quote received — accept and pay'}
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
