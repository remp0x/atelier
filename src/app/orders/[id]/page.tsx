'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { atelierHref } from '@/lib/atelier-paths';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { sendUsdcPayment } from '@/lib/solana-pay';
import type { ServiceOrder, ServiceReview, OrderStatus, OrderDeliverable, OrderMessage } from '@/lib/atelier-db';

interface OrderData {
  order: ServiceOrder;
  review: ServiceReview | null;
  deliverables: OrderDeliverable[];
}

type StepState = 'done' | 'active' | 'pending';

interface TimelineStep {
  label: string;
  state: StepState;
  timestamp: string | null;
  content: React.ReactNode | null;
}

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
  pending_quote: 'bg-neutral-500/20 text-neutral-300',
  quoted: 'bg-atelier/10 text-atelier-bright',
  accepted: 'bg-atelier/10 text-atelier-bright',
  paid: 'bg-atelier/20 text-atelier-bright',
  in_progress: 'bg-amber-400/10 text-amber-400',
  delivered: 'bg-emerald-400/10 text-emerald-400',
  revision_requested: 'bg-amber-400/20 text-amber-400',
  completed: 'bg-emerald-400/20 text-emerald-400',
  disputed: 'bg-red-400/10 text-red-400',
  cancelled: 'bg-red-400/10 text-red-400',
};

const STATUS_SEQUENCE: OrderStatus[] = [
  'pending_quote', 'quoted', 'accepted', 'paid', 'in_progress', 'delivered', 'completed',
];

function statusIndex(status: OrderStatus): number {
  const idx = STATUS_SEQUENCE.indexOf(status);
  return idx === -1 ? -1 : idx;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function truncateId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 8)}...${id.slice(-6)}` : id;
}

function formatTimeRemaining(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

function buildTimeline(order: ServiceOrder, review: ServiceReview | null): TimelineStep[] {
  const idx = statusIndex(order.status);
  const isTerminal = order.status === 'cancelled' || order.status === 'disputed';
  const isRevision = order.status === 'revision_requested';

  const steps: TimelineStep[] = [
    {
      label: 'Order Placed',
      state: 'done',
      timestamp: order.created_at,
      content: (
        <div>
          <p className="text-sm text-neutral-400">{order.brief}</p>
          {order.reference_images && (() => {
            try {
              const images: string[] = JSON.parse(order.reference_images);
              if (images.length === 0) return null;
              return (
                <div className="flex gap-2 mt-2">
                  {images.map((url, i) => (
                    <div key={i} className="group relative">
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={url}
                          alt={`Reference ${i + 1}`}
                          className="w-16 h-16 rounded border border-neutral-800 object-cover hover:border-atelier transition-colors"
                        />
                      </a>
                      <div className="absolute -top-1 -right-1">
                        <DownloadButton url={url} name={`reference-${i + 1}`} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            } catch { return null; }
          })()}
        </div>
      ),
    },
    {
      label: 'Quote Received',
      state: idx >= 1 ? 'done' : isTerminal ? 'pending' : (idx === 0 ? 'active' : 'pending'),
      timestamp: idx >= 1 ? order.created_at : null,
      content: order.quoted_price_usd ? (
        <div className="flex items-center gap-3 text-sm font-mono">
          <span className="text-white">${order.quoted_price_usd}</span>
          {order.platform_fee_usd && (
            <span className="text-neutral-400">+ ${order.platform_fee_usd} fee</span>
          )}
        </div>
      ) : null,
    },
    {
      label: 'Payment Confirmed',
      state: idx >= 3 ? 'done' : isTerminal ? 'pending' : (idx === 2 ? 'active' : 'pending'),
      timestamp: null,
      content: idx >= 3 ? (
        <div className="text-sm font-mono space-y-1">
          {order.payment_method && <p className="text-neutral-400">{order.payment_method}</p>}
          {order.escrow_tx_hash && (
            <p className="text-neutral-400 break-all">
              tx: <span className="text-atelier-bright">{truncateId(order.escrow_tx_hash)}</span>
            </p>
          )}
        </div>
      ) : null,
    },
    {
      label: 'Generation Started',
      state: idx >= 4 ? 'done' : isTerminal ? 'pending' : (idx === 3 ? 'active' : 'pending'),
      timestamp: null,
      content: null,
    },
    {
      label: order.revision_count > 0 ? `Delivered (Revision ${order.revision_count})` : 'Delivered',
      state: idx >= 5 || isRevision ? 'done' : isTerminal ? 'pending' : (idx === 4 ? 'active' : 'pending'),
      timestamp: order.delivered_at,
      content: (idx >= 5 || isRevision) ? (
        <DeliverableMedia
          url={order.deliverable_url}
          mediaType={order.deliverable_media_type}
        />
      ) : null,
    },
  ];

  if (isRevision) {
    steps.push({
      label: 'Revision Requested',
      state: 'active',
      timestamp: null,
      content: (
        <p className="text-sm text-amber-400 font-mono">
          Waiting for agent to re-deliver ({order.revision_count} of {order.max_revisions} included)
        </p>
      ),
    });
  }

  steps.push({
    label: 'Completed',
    state: idx >= 6 ? 'done' : (isTerminal || isRevision) ? 'pending' : (idx === 5 ? 'active' : 'pending'),
    timestamp: order.completed_at,
    content: idx >= 6 && review ? (
      <ReviewInline review={review} />
    ) : null,
  });

  if (isTerminal) {
    steps.push({
      label: order.status === 'cancelled' ? 'Cancelled' : 'Disputed',
      state: 'done',
      timestamp: null,
      content: null,
    });
  }

  return steps;
}

function StatusBanner({ order }: { order: ServiceOrder }) {
  const banners: Partial<Record<OrderStatus, { bg: string; text: string; message: string }>> = {
    pending_quote: { bg: 'bg-neutral-500/10 border-neutral-500/20', text: 'text-neutral-400', message: 'Waiting for the agent to send a quote...' },
    quoted: { bg: 'bg-atelier/5 border-atelier/20', text: 'text-atelier', message: 'Quote received! Review the price and pay to get started.' },
    paid: { bg: 'bg-atelier/5 border-atelier/20', text: 'text-atelier', message: 'Payment confirmed. The agent will start working shortly.' },
    in_progress: { bg: 'bg-amber-400/5 border-amber-400/20', text: 'text-amber-400', message: 'The agent is working on your order...' },
    delivered: { bg: 'bg-emerald-400/5 border-emerald-400/20', text: 'text-emerald-400', message: 'Your order has been delivered! Review the result and approve below.' },
    revision_requested: { bg: 'bg-amber-400/5 border-amber-400/20', text: 'text-amber-400', message: 'Revision requested. Waiting for the agent to re-deliver.' },
    completed: { bg: 'bg-emerald-400/5 border-emerald-400/20', text: 'text-emerald-400', message: 'Order completed! Thank you for using Atelier.' },
    disputed: { bg: 'bg-red-400/5 border-red-400/20', text: 'text-red-400', message: 'This order is under dispute. We will review and resolve it.' },
    cancelled: { bg: 'bg-red-400/5 border-red-400/20', text: 'text-red-400', message: 'This order has been cancelled.' },
  };

  const config = banners[order.status];
  if (!config) return null;

  return (
    <div className={`mb-6 p-3 rounded-lg border ${config.bg}`}>
      <p className={`text-sm font-mono ${config.text}`}>{config.message}</p>
    </div>
  );
}

function ConfirmDialog({ open, title, message, confirmLabel, confirmClass, onConfirm, onCancel, loading }: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmClass: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm mx-4 bg-white dark:bg-black-soft border border-gray-200 dark:border-neutral-800 rounded-lg shadow-2xl p-6">
        <h3 className="text-base font-bold font-display text-black dark:text-white mb-2">{title}</h3>
        <p className="text-sm text-gray-500 dark:text-neutral-400 font-mono mb-5">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 rounded border border-gray-200 dark:border-neutral-700 text-gray-500 dark:text-neutral-400 text-sm font-mono hover:bg-gray-100 dark:hover:bg-neutral-800 disabled:opacity-40 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-2.5 rounded text-white text-sm font-mono font-medium disabled:opacity-60 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${confirmClass}`}
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function DownloadButton({ url, name }: { url: string; name?: string }) {
  return (
    <button
      onClick={() => {
        fetch(url).then(r => r.blob()).then(blob => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = name || 'download';
          a.click();
          URL.revokeObjectURL(a.href);
        });
      }}
      className="p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
      title="Download"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
    </button>
  );
}

function DeliverableMedia({ url, mediaType }: { url: string | null; mediaType: string | null }) {
  if (!url) return null;

  if (mediaType === 'video') {
    return (
      <div className="group relative max-w-md mt-2">
        <video src={url} controls playsInline className="w-full rounded-lg border border-neutral-800" />
        <div className="absolute top-2 right-2"><DownloadButton url={url} name="deliverable" /></div>
      </div>
    );
  }

  if (mediaType === 'link') {
    return (
      <div className="mt-2 p-4 rounded-lg border border-neutral-800 bg-neutral-900/50 max-w-md">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-purple-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.03a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.374" />
          </svg>
          <span className="text-xs font-mono text-neutral-400 uppercase tracking-wider">Delivered Link</span>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 font-mono text-sm break-all underline underline-offset-2">
          {url}
        </a>
      </div>
    );
  }

  if (mediaType === 'document' || mediaType === 'code') {
    const label = mediaType === 'code' ? 'Code Deliverable' : 'Document';
    return (
      <div className="mt-2 p-4 rounded-lg border border-neutral-800 bg-neutral-900/50 max-w-md">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-purple-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <span className="text-xs font-mono text-neutral-400 uppercase tracking-wider">{label}</span>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 font-mono text-sm break-all underline underline-offset-2">
          {url}
        </a>
        <div className="mt-2"><DownloadButton url={url} name="deliverable" /></div>
      </div>
    );
  }

  if (mediaType === 'text') {
    return (
      <div className="mt-2 p-4 rounded-lg border border-neutral-800 bg-neutral-900/50 max-w-md">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-purple-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
          </svg>
          <span className="text-xs font-mono text-neutral-400 uppercase tracking-wider">Text Deliverable</span>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 font-mono text-sm break-all underline underline-offset-2">
          {url}
        </a>
        <div className="mt-2"><DownloadButton url={url} name="deliverable" /></div>
      </div>
    );
  }

  return (
    <div className="group relative max-w-md mt-2">
      <img src={url} alt="Deliverable" className="w-full rounded-lg border border-neutral-800" />
      <div className="absolute top-2 right-2"><DownloadButton url={url} name="deliverable" /></div>
    </div>
  );
}

function ReviewForm({ orderId, onSubmitted }: { orderId: string; onSubmitted: () => void }) {
  const { walletAddress, getAuth } = useAtelierAuth();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!walletAddress || rating === 0) return;
    setSubmitting(true);
    setError(null);

    try {
      const auth = await getAuth();
      const res = await fetch(`/api/orders/${orderId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...auth,
          rating,
          comment: comment.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'Failed to submit review');
        return;
      }
      onSubmitted();
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }, [getAuth, walletAddress, orderId, rating, comment, onSubmitted]);

  return (
    <div className="mt-4 p-4 rounded-lg bg-neutral-50 dark:bg-black-soft border border-neutral-200 dark:border-neutral-800">
      <p className="text-sm font-mono text-neutral-400 mb-3">Leave a review</p>
      <div className="flex items-center gap-1 mb-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <button
            key={i}
            onMouseEnter={() => setHoverRating(i + 1)}
            onMouseLeave={() => setHoverRating(0)}
            onClick={() => setRating(i + 1)}
            className="transition-colors"
          >
            <svg
              className={`w-5 h-5 ${
                i < (hoverRating || rating) ? 'text-atelier' : 'text-neutral-700'
              }`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </button>
        ))}
        {rating > 0 && (
          <span className="text-xs font-mono text-neutral-500 ml-2">{rating}/5</span>
        )}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="How was the service? (optional)"
        rows={2}
        maxLength={500}
        className="w-full px-3 py-2 rounded bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 text-black dark:text-white text-sm font-mono placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-atelier resize-none mb-3"
      />
      {error && <p className="text-xs text-red-400 font-mono mb-2">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={rating === 0 || submitting}
        className="w-full py-2 rounded border border-atelier text-atelier text-xs font-medium font-mono tracking-wide disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:bg-atelier hover:text-white flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <div className="w-3 h-3 border-2 border-atelier/40 border-t-atelier rounded-full animate-spin" />
            Submitting...
          </>
        ) : (
          'Submit Review'
        )}
      </button>
    </div>
  );
}

function ReviewInline({ review }: { review: ServiceReview }) {
  return (
    <div className="mt-2 p-3 rounded-lg bg-neutral-50 dark:bg-black-soft border border-neutral-200 dark:border-neutral-800">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-semibold">{review.reviewer_name}</span>
        <div className="flex items-center gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <svg
              key={i}
              className={`w-3.5 h-3.5 ${i < review.rating ? 'text-atelier' : 'text-neutral-800'}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          ))}
        </div>
      </div>
      {review.comment && <p className="text-sm text-neutral-400">{review.comment}</p>}
    </div>
  );
}

function TimelineDot({ state, isTerminal }: { state: StepState; isTerminal: boolean }) {
  if (isTerminal) {
    return (
      <div className="w-3.5 h-3.5 rounded-full bg-red-400 ring-4 ring-red-400/20 shrink-0" />
    );
  }

  if (state === 'done') {
    return (
      <div className="w-3.5 h-3.5 rounded-full bg-emerald-400 ring-4 ring-emerald-400/20 shrink-0" />
    );
  }

  if (state === 'active') {
    return (
      <div className="w-3.5 h-3.5 rounded-full bg-atelier animate-pulse-atelier ring-4 ring-atelier/20 shrink-0" />
    );
  }

  return (
    <div className="w-3.5 h-3.5 rounded-full bg-neutral-800 border border-neutral-600 shrink-0" />
  );
}

function WorkspaceView({ data, onRefresh }: { data: OrderData; onRefresh: () => void }) {
  const { order, deliverables: initialDeliverables } = data;
  const { walletAddress, getAuth } = useAtelierAuth();
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [deliverables, setDeliverables] = useState<OrderDeliverable[]>(initialDeliverables);
  const [quotaUsed, setQuotaUsed] = useState(order.quota_used);
  const [timeRemaining, setTimeRemaining] = useState(
    order.workspace_expires_at ? formatTimeRemaining(order.workspace_expires_at) : '',
  );
  const [approving, setApproving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const isActive = order.status === 'in_progress';
  const isExpired = order.workspace_expires_at
    ? new Date(order.workspace_expires_at) <= new Date()
    : false;
  const quotaRemaining = order.quota_total - quotaUsed;
  const canGenerate = isActive && !isExpired && quotaRemaining > 0 && !generating;

  useEffect(() => {
    if (!order.workspace_expires_at) return;

    const tick = () => {
      const remaining = formatTimeRemaining(order.workspace_expires_at!);
      setTimeRemaining(remaining);
      if (remaining === 'Expired' && order.status === 'in_progress') {
        onRefresh();
      }
    };

    tick();
    timerRef.current = setInterval(tick, 60_000);
    return () => clearInterval(timerRef.current);
  }, [order.workspace_expires_at, order.status, onRefresh]);

  const handleGenerate = useCallback(async () => {
    if (!canGenerate || !walletAddress || !prompt.trim()) return;

    setGenerating(true);
    setGenError(null);

    try {
      const auth = await getAuth();
      const res = await fetch(`/api/orders/${order.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...auth,
          prompt: prompt.trim(),
        }),
      });
      const json = await res.json();

      if (!json.success) {
        setGenError(json.error || 'Generation failed');
        if (json.data?.deliverable) {
          setDeliverables((prev) => [json.data.deliverable, ...prev]);
        }
        return;
      }

      setDeliverables((prev) => [json.data.deliverable, ...prev]);
      setQuotaUsed(json.data.quota_used);
      setPrompt('');

      if (json.data.quota_used >= order.quota_total) {
        onRefresh();
      }
    } catch {
      setGenError('Network error');
    } finally {
      setGenerating(false);
    }
  }, [canGenerate, walletAddress, prompt, order.id, order.quota_total, onRefresh, getAuth]);

  const handleApprove = useCallback(async () => {
    if (!walletAddress) return;
    setApproving(true);
    try {
      const auth = await getAuth();
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...auth, action: 'approve' }),
      });
      const json = await res.json();
      if (json.success) onRefresh();
    } finally {
      setApproving(false);
    }
  }, [getAuth, walletAddress, order.id, onRefresh]);

  return (
    <div className="space-y-6">
      {/* Brief context */}
      {order.brief && (
        <div className="p-3 rounded bg-atelier/5 border border-atelier/10">
          <p className="text-2xs font-mono text-neutral-500 mb-1">Project brief</p>
          <p className="text-sm text-neutral-300">{order.brief}</p>
          {order.reference_images && (() => {
            try {
              const images: string[] = JSON.parse(order.reference_images);
              if (images.length === 0) return null;
              return (
                <div className="flex gap-2 mt-2">
                  {images.map((url, i) => (
                    <div key={i} className="group relative">
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={url}
                          alt={`Reference ${i + 1}`}
                          className="w-16 h-16 rounded border border-atelier/20 object-cover hover:border-atelier transition-colors"
                        />
                      </a>
                      <div className="absolute -top-1 -right-1">
                        <DownloadButton url={url} name={`reference-${i + 1}`} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            } catch { return null; }
          })()}
        </div>
      )}

      {/* Stats bar */}
      <div className="flex items-center justify-between p-4 rounded bg-black border border-neutral-800">
        <div className="font-mono text-sm">
          <span className="text-white font-bold">{quotaRemaining}</span>
          <span className="text-neutral-400"> / {order.quota_total} remaining</span>
        </div>
        <div className="font-mono text-sm">
          {isExpired ? (
            <span className="text-red-400">Expired</span>
          ) : (
            <span className="text-neutral-400">{timeRemaining}</span>
          )}
        </div>
      </div>

      {/* Prompt input */}
      {canGenerate && (
        <div className="space-y-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={deliverables.length === 0
              ? 'Describe your first scene or image...'
              : 'Describe the next generation (characters and style will stay consistent)...'}
            rows={3}
            maxLength={1000}
            className="w-full px-4 py-3 rounded bg-black border border-neutral-800 text-white text-sm font-mono placeholder:text-neutral-600 focus:outline-none focus:border-atelier resize-none"
          />
          {genError && <p className="text-sm text-red-400 font-mono">{genError}</p>}
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || generating}
            className="w-full py-2.5 rounded border border-atelier text-atelier text-sm font-medium font-mono tracking-wide disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:bg-atelier hover:text-white flex items-center justify-center gap-2"
          >
            {generating ? (
              <>
                <div className="w-4 h-4 border-2 border-atelier/40 border-t-atelier rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              'Generate'
            )}
          </button>
        </div>
      )}

      {/* Approve button for delivered workspace orders */}
      {order.status === 'delivered' && walletAddress && order.client_wallet === walletAddress && (
        <button
          onClick={handleApprove}
          disabled={approving}
          className="w-full py-2.5 rounded border border-emerald-500/50 text-emerald-500 text-sm font-medium font-mono tracking-wide disabled:opacity-60 transition-all duration-200 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 flex items-center justify-center gap-2"
        >
          {approving ? (
            <>
              <div className="w-4 h-4 border-2 border-emerald-500/40 border-t-emerald-500 rounded-full animate-spin" />
              Approving...
            </>
          ) : (
            'Approve & Complete'
          )}
        </button>
      )}

      {/* Gallery */}
      {deliverables.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-mono text-neutral-400">
            Gallery ({deliverables.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {deliverables.map((d) => (
              <div
                key={d.id}
                className="group relative rounded-lg border border-neutral-800 overflow-hidden bg-black"
              >
                {d.status === 'completed' && d.deliverable_url ? (
                  <>
                    {d.deliverable_media_type === 'video' ? (
                      <video
                        src={d.deliverable_url}
                        controls
                        playsInline
                        className="w-full aspect-square object-cover"
                      />
                    ) : d.deliverable_media_type === 'image' || !d.deliverable_media_type ? (
                      <img
                        src={d.deliverable_url}
                        alt={d.prompt}
                        className="w-full aspect-square object-cover"
                      />
                    ) : (
                      <div className="w-full aspect-square flex flex-col items-center justify-center gap-2 p-3">
                        <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.03a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.374" />
                        </svg>
                        <a href={d.deliverable_url} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 text-xs font-mono text-center break-all underline underline-offset-2">
                          {d.deliverable_media_type}
                        </a>
                      </div>
                    )}
                    <div className="absolute top-2 right-2">
                      <DownloadButton url={d.deliverable_url} name={d.prompt?.slice(0, 40) || 'deliverable'} />
                    </div>
                  </>
                ) : (
                  <div className="w-full aspect-square flex items-center justify-center">
                    {d.status === 'generating' || d.status === 'pending' ? (
                      <div className="w-5 h-5 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </div>
                )}
                <div className="p-2">
                  <p className="text-2xs text-neutral-400 font-mono line-clamp-2">{d.prompt}</p>
                  {d.status === 'failed' && d.error && (
                    <p className="text-2xs text-red-400 font-mono mt-1 line-clamp-1">{d.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {deliverables.length === 0 && isActive && (
        <div className="text-center py-12">
          <p className="text-sm text-neutral-500 font-mono">
            No generations yet. Submit a prompt to get started.
          </p>
        </div>
      )}
    </div>
  );
}

function OrderChat({ orderId, wallet: walletAddress }: { orderId: string; wallet: string }) {
  const { getAuth, clearAuth } = useAtelierAuth();
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const auth = await getAuth();
      const qs = new URLSearchParams({
        wallet: auth.wallet,
        wallet_sig: auth.wallet_sig,
        wallet_sig_ts: String(auth.wallet_sig_ts),
      });
      const res = await fetch(`/api/orders/${orderId}/messages?${qs}`);
      const json = await res.json();
      if (json.success) {
        setMessages(json.data);
      } else if (json.error?.includes('expired')) {
        clearAuth();
      }
    } catch {
      // silent polling failure
    }
  }, [orderId, getAuth, clearAuth]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 10_000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      const auth = await getAuth();
      const res = await fetch(`/api/orders/${orderId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...auth, content: input.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setMessages((prev) => [...prev, json.data]);
        setInput('');
      }
    } catch {
      // send failure
    } finally {
      setSending(false);
    }
  }, [orderId, getAuth, input, sending]);

  return (
    <div>
      <h3 className="text-sm font-mono text-neutral-400 mb-3">Messages</h3>
      <div
        ref={containerRef}
        className="border border-neutral-200 dark:border-neutral-800 rounded-lg bg-neutral-50 dark:bg-black p-4 min-h-[300px] max-h-[50vh] overflow-y-auto space-y-3"
      >
        {messages.length === 0 && (
          <p className="text-xs text-neutral-400 dark:text-neutral-600 font-mono text-center py-4">No messages yet</p>
        )}
        {messages.map((msg) => {
          const isMe = msg.sender_id === walletAddress;
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-lg px-3 py-2 ${
                isMe
                  ? 'bg-atelier/20 text-black dark:text-white'
                  : 'bg-white dark:bg-black-soft border border-neutral-200 dark:border-neutral-800 text-black dark:text-white'
              }`}>
                <p className="text-2xs font-mono text-neutral-500 mb-0.5">
                  {msg.sender_name || (isMe ? 'You' : msg.sender_type)}
                </p>
                <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <div className="flex gap-2 mt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Type a message..."
          maxLength={2000}
          className="flex-1 px-3 py-2 rounded bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 text-black dark:text-white text-sm font-mono placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-atelier"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="px-4 py-2 rounded border border-atelier/60 text-atelier text-sm font-mono font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:bg-atelier hover:text-white hover:border-atelier"
        >
          {sending ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}

export default function AtelierOrderPage() {
  const params = useParams();
  const { walletAddress, getAuth, getTransactionWallet } = useAtelierAuth();
  const { connection } = useConnection();
  const [data, setData] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [requestingRevision, setRequestingRevision] = useState(false);
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionFeedback, setRevisionFeedback] = useState('');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [payMsg, setPayMsg] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${params.id}`);
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'Order not found');
        return;
      }
      setData(json.data);
    } catch {
      setError('Failed to load order');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <AtelierAppLayout>
        <div className="flex items-center justify-center min-h-screen pt-14">
          <div className="w-6 h-6 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
        </div>
      </AtelierAppLayout>
    );
  }

  if (error || !data) {
    return (
      <AtelierAppLayout>
        <div className="flex flex-col items-center justify-center min-h-screen pt-14 gap-4">
          <p className="text-neutral-500 font-mono">{error || 'Order not found'}</p>
          <Link href={atelierHref('/atelier/orders')} className="text-atelier font-mono text-sm hover:underline">
            Back to Orders
          </Link>
        </div>
      </AtelierAppLayout>
    );
  }

  const { order, review } = data;
  const isWorkspace = order.quota_total > 0;
  const isTerminal = order.status === 'cancelled' || order.status === 'disputed';
  const showWorkspace = isWorkspace && ['in_progress', 'delivered', 'completed'].includes(order.status);
  const canCancel = ['pending_quote', 'quoted', 'accepted', 'paid'].includes(order.status)
    && walletAddress && order.client_wallet === walletAddress;

  return (
    <AtelierAppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pt-20">
        <Link
          href={atelierHref('/atelier/orders')}
          className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-atelier font-mono mb-6 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          My Orders
        </Link>

        <div className="flex flex-col lg:grid lg:grid-cols-[1fr_360px] lg:gap-8">
          {/* === SIDEBAR (shows first on mobile, right column on desktop) === */}
          <div className="lg:order-last mb-6 lg:mb-0">
            <div className="lg:sticky lg:top-20 space-y-3">
              {/* Order Header */}
              <div className="p-4 rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0a0a0a]">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <h1 className="text-base font-bold font-display truncate">{order.service_title}</h1>
                    <p className="text-2xs font-mono text-neutral-500 mt-0.5">{order.id}</p>
                  </div>
                  <span className={`shrink-0 inline-flex px-2.5 py-0.5 rounded-full text-2xs font-mono font-medium ${STATUS_COLORS[order.status] || 'bg-neutral-800 text-neutral-300'}`}>
                    {STATUS_LABELS[order.status] || order.status}
                  </span>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500 font-mono text-2xs">Provider</span>
                    <Link href={atelierHref(`/atelier/agents/${order.provider_agent_id}`)} className="text-atelier hover:underline text-xs font-mono">
                      {order.provider_name}
                    </Link>
                  </div>
                  {order.client_name && (
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500 font-mono text-2xs">Client</span>
                      <span className="text-black dark:text-white text-xs font-mono">{order.client_name}</span>
                    </div>
                  )}
                  {order.quoted_price_usd && (
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500 font-mono text-2xs">Price</span>
                      <span className="text-black dark:text-white text-xs font-mono font-bold">${order.quoted_price_usd} USDC</span>
                    </div>
                  )}
                  {order.escrow_tx_hash && (
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500 font-mono text-2xs">Tx</span>
                      <span className="text-atelier-bright text-2xs font-mono">{truncateId(order.escrow_tx_hash)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Brief */}
              {order.brief && (
                <div className="p-4 rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0a0a0a]">
                  <p className="text-2xs font-mono text-neutral-500 uppercase tracking-wider mb-2">Brief</p>
                  <p className="text-sm text-gray-700 dark:text-neutral-300 leading-relaxed">{order.brief}</p>
                  {order.reference_images && (() => {
                    try {
                      const images: string[] = JSON.parse(order.reference_images);
                      if (images.length === 0) return null;
                      return (
                        <div className="flex gap-2 mt-3 flex-wrap">
                          {images.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                              <img src={url} alt={`Reference ${i + 1}`} className="w-12 h-12 rounded border border-neutral-800 object-cover hover:border-atelier transition-colors" />
                            </a>
                          ))}
                        </div>
                      );
                    } catch { return null; }
                  })()}
                </div>
              )}

              {/* Compact Progress */}
              <div className="p-4 rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0a0a0a]">
                <p className="text-2xs font-mono text-neutral-500 uppercase tracking-wider mb-3">Progress</p>
                <div className="space-y-1.5">
                  {STATUS_SEQUENCE.map((s, i) => {
                    const currentIdx = statusIndex(order.status);
                    const isDone = i < currentIdx || (i === currentIdx && order.status === 'completed');
                    const isCurrent = i === currentIdx && order.status !== 'completed';
                    const isRevision = order.status === 'revision_requested' && s === 'delivered';
                    return (
                      <div key={s} className="flex items-center gap-2.5">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isDone || isRevision ? 'bg-emerald-400' : isCurrent ? 'bg-atelier animate-pulse' : 'bg-neutral-700'
                        }`} />
                        <span className={`text-2xs font-mono ${
                          isDone || isRevision ? 'text-neutral-400' : isCurrent ? 'text-white font-medium' : 'text-neutral-600'
                        }`}>{STATUS_LABELS[s]}</span>
                      </div>
                    );
                  })}
                  {isTerminal && (
                    <div className="flex items-center gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-red-400" />
                      <span className="text-2xs font-mono text-red-400">{order.status === 'cancelled' ? 'Cancelled' : 'Disputed'}</span>
                    </div>
                  )}
                  {order.status === 'revision_requested' && (
                    <div className="flex items-center gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-amber-400 animate-pulse" />
                      <span className="text-2xs font-mono text-amber-400">Revision Requested</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                {/* Accept & Pay */}
                {order.status === 'quoted' && walletAddress && order.client_wallet === walletAddress && (
                  <div className="p-4 rounded-lg border border-atelier/30 bg-atelier/5">
                    {payError && <p className="text-2xs font-mono text-red-400 mb-2">{payError}</p>}
                    {payMsg && <p className="text-2xs font-mono text-neutral-400 mb-2">{payMsg}</p>}
                    <button
                      onClick={async () => {
                        setPaying(true);
                        setPayError(null);
                        setPayMsg(null);
                        try {
                          const treasuryWallet = process.env.NEXT_PUBLIC_ATELIER_TREASURY_WALLET;
                          if (!treasuryWallet) { setPayError('Treasury wallet not configured'); return; }
                          const total = parseFloat(order.quoted_price_usd || '0');
                          if (total <= 0) { setPayError('Invalid order total'); return; }
                          setPayMsg('Sending USDC payment...');
                          const txSig = await sendUsdcPayment(connection, getTransactionWallet()!, new PublicKey(treasuryWallet), total);
                          setPayMsg('Verifying payment...');
                          const auth = await getAuth();
                          const res = await fetch(`/api/orders/${order.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ...auth, action: 'pay', payment_method: 'usdc-sol', escrow_tx_hash: txSig }),
                          });
                          const json = await res.json();
                          if (!json.success) { setPayError(json.error || 'Payment verification failed'); return; }
                          setPayMsg(null);
                          load();
                        } catch (e) {
                          setPayError(e instanceof Error ? e.message : 'Payment failed');
                        } finally {
                          setPaying(false);
                          setPayMsg(null);
                        }
                      }}
                      disabled={paying}
                      className="w-full py-2.5 rounded border border-atelier text-atelier font-mono font-medium text-sm transition-all duration-200 hover:bg-atelier hover:text-white disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {paying ? (
                        <>
                          <div className="w-4 h-4 border-2 border-atelier/40 border-t-atelier rounded-full animate-spin" />
                          {payMsg || 'Processing...'}
                        </>
                      ) : (
                        `Accept & Pay $${parseFloat(order.quoted_price_usd || '0').toFixed(2)}`
                      )}
                    </button>
                  </div>
                )}

                {/* Approve / Revise / Dispute */}
                {order.status === 'delivered' && walletAddress && order.client_wallet === walletAddress && (
                  <>
                    {order.revision_count > 0 && (
                      <p className="text-2xs font-mono text-neutral-500 px-1">
                        {order.revision_count}/{order.max_revisions} revisions used
                      </p>
                    )}
                    <button
                      onClick={() => setShowApproveConfirm(true)}
                      disabled={approving || disputing || requestingRevision}
                      className="w-full py-2.5 rounded bg-emerald-500 text-white text-sm font-medium font-mono tracking-wide disabled:opacity-60 transition-all hover:bg-emerald-600 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {approving ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          Approving...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                          Approve & Complete
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => { setShowRevisionForm(true); setShowDisputeForm(false); }}
                      disabled={approving || requestingRevision || showRevisionForm}
                      className="w-full py-2 rounded border border-amber-400/30 text-amber-400 text-xs font-mono hover:bg-amber-400/10 disabled:opacity-60 transition-colors cursor-pointer"
                    >
                      {order.revision_count >= order.max_revisions ? 'Extra Revision' : 'Request Revision'}
                    </button>
                    <button
                      onClick={() => { setShowDisputeForm(true); setShowRevisionForm(false); }}
                      disabled={approving || disputing || showDisputeForm}
                      className="w-full text-2xs font-mono text-red-400/70 hover:text-red-400 disabled:opacity-60 transition-colors cursor-pointer py-1"
                    >
                      Report a problem
                    </button>
                  </>
                )}

                {/* Cancel */}
                {canCancel && (
                  <button
                    onClick={() => setShowCancelConfirm(true)}
                    disabled={cancelling}
                    className="w-full text-xs font-mono text-red-400/70 hover:text-red-400 disabled:opacity-50 transition-colors cursor-pointer py-2 rounded border border-red-400/20 hover:bg-red-400/5"
                  >
                    {cancelling ? 'Cancelling...' : 'Cancel Order'}
                  </button>
                )}

                {/* Hire Again */}
                {order.status === 'completed' && order.service_id && (
                  <Link
                    href={atelierHref(`/atelier/agents/${order.provider_agent_id}`)}
                    className="w-full py-2.5 rounded border border-atelier text-atelier text-sm font-medium font-mono tracking-wide transition-all duration-200 hover:bg-atelier hover:text-white flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
                    </svg>
                    Hire {order.provider_name} Again
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* === MAIN CONTENT (second on mobile, left column on desktop) === */}
          <div className="lg:order-first min-w-0 space-y-6">
            <StatusBanner order={order} />

            {showWorkspace ? (
              <WorkspaceView data={data} onRefresh={load} />
            ) : (
              <>
                {order.deliverable_url && (
                  <DeliverableMedia url={order.deliverable_url} mediaType={order.deliverable_media_type} />
                )}
              </>
            )}

            {review && <ReviewInline review={review} />}

            {/* Revision form */}
            {showRevisionForm && order.status === 'delivered' && walletAddress && order.client_wallet === walletAddress && (
              <div className="p-4 rounded-lg border border-amber-400/20 bg-amber-400/5">
                {order.revision_count >= order.max_revisions && (
                  <p className="text-xs font-mono text-amber-400/70 mb-3">
                    You have used all {order.max_revisions} included revision{order.max_revisions !== 1 ? 's' : ''}. The agent may decline this extra request.
                  </p>
                )}
                <p className="text-sm font-mono text-amber-400 mb-3">What changes would you like?</p>
                <textarea
                  value={revisionFeedback}
                  onChange={(e) => setRevisionFeedback(e.target.value)}
                  placeholder="Describe the changes you'd like..."
                  rows={3}
                  maxLength={2000}
                  className="w-full px-3 py-2 rounded bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 text-black dark:text-white text-sm font-mono placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-amber-400 resize-none mb-3"
                />
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (!revisionFeedback.trim()) return;
                      setRequestingRevision(true);
                      try {
                        const auth = await getAuth();
                        const res = await fetch(`/api/orders/${order.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ ...auth, action: 'revision', feedback: revisionFeedback.trim() }),
                        });
                        const json = await res.json();
                        if (json.success) {
                          await fetch(`/api/orders/${order.id}/messages`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ...auth, content: `Revision request: ${revisionFeedback.trim()}` }),
                          });
                          setShowRevisionForm(false);
                          setRevisionFeedback('');
                          load();
                        }
                      } finally {
                        setRequestingRevision(false);
                      }
                    }}
                    disabled={!revisionFeedback.trim() || requestingRevision}
                    className="flex-1 py-2 rounded bg-amber-500 text-white text-sm font-mono font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
                  >
                    {requestingRevision ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      order.revision_count >= order.max_revisions ? 'Request Extra Revision' : 'Submit Revision Request'
                    )}
                  </button>
                  <button
                    onClick={() => { setShowRevisionForm(false); setRevisionFeedback(''); }}
                    disabled={requestingRevision}
                    className="px-4 py-2 rounded border border-neutral-300 dark:border-neutral-700 text-neutral-500 text-sm font-mono hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Dispute form */}
            {showDisputeForm && order.status === 'delivered' && walletAddress && order.client_wallet === walletAddress && (
              <div className="p-4 rounded-lg border border-red-400/20 bg-red-400/5">
                <p className="text-sm font-mono text-red-400 mb-3">Why are you disputing this order?</p>
                <textarea
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="Describe the issue with the delivery..."
                  rows={3}
                  maxLength={2000}
                  className="w-full px-3 py-2 rounded bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 text-black dark:text-white text-sm font-mono placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-red-400 resize-none mb-3"
                />
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (!disputeReason.trim()) return;
                      setDisputing(true);
                      try {
                        const auth = await getAuth();
                        const res = await fetch(`/api/orders/${order.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ ...auth, action: 'dispute', reason: disputeReason.trim() }),
                        });
                        const json = await res.json();
                        if (json.success) {
                          await fetch(`/api/orders/${order.id}/messages`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ...auth, content: `Dispute: ${disputeReason.trim()}` }),
                          });
                          setShowDisputeForm(false);
                          setDisputeReason('');
                          load();
                        }
                      } finally {
                        setDisputing(false);
                      }
                    }}
                    disabled={!disputeReason.trim() || disputing}
                    className="flex-1 py-2 rounded bg-red-500 text-white text-sm font-mono font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
                  >
                    {disputing ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      'Submit Dispute'
                    )}
                  </button>
                  <button
                    onClick={() => { setShowDisputeForm(false); setDisputeReason(''); }}
                    disabled={disputing}
                    className="px-4 py-2 rounded border border-neutral-300 dark:border-neutral-700 text-neutral-500 text-sm font-mono hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Review */}
            {order.status === 'completed' && !review && walletAddress && order.client_wallet === walletAddress && (
              <div>
                <div className="p-4 rounded-lg border border-atelier/20 bg-atelier/5 mb-2">
                  <p className="text-sm font-mono text-atelier mb-1">How was your experience?</p>
                  <p className="text-xs text-neutral-500">Your review helps other buyers find great agents.</p>
                </div>
                <ReviewForm orderId={order.id} onSubmitted={load} />
              </div>
            )}

            {/* Chat — always visible */}
            {walletAddress && !['pending_quote', 'quoted', 'accepted'].includes(order.status) && (
              <OrderChat orderId={order.id} wallet={walletAddress} />
            )}
          </div>
        </div>

        {/* Confirm Dialogs */}
        <ConfirmDialog
          open={showApproveConfirm}
          title="Approve & Complete"
          message="This will release the payment to the agent. This action cannot be undone."
          confirmLabel="Approve"
          confirmClass="bg-emerald-500 hover:bg-emerald-600"
          loading={approving}
          onCancel={() => setShowApproveConfirm(false)}
          onConfirm={async () => {
            setApproving(true);
            try {
              const auth = await getAuth();
              const res = await fetch(`/api/orders/${order.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...auth, action: 'approve' }),
              });
              const json = await res.json();
              if (json.success) {
                setShowApproveConfirm(false);
                load();
              }
            } finally {
              setApproving(false);
            }
          }}
        />
        <ConfirmDialog
          open={showCancelConfirm}
          title="Cancel Order"
          message={order.status === 'paid'
            ? 'Cancel this order? A refund will be issued to your wallet.'
            : 'Are you sure you want to cancel this order?'}
          confirmLabel="Cancel Order"
          confirmClass="bg-red-500 hover:bg-red-600"
          loading={cancelling}
          onCancel={() => setShowCancelConfirm(false)}
          onConfirm={async () => {
            setCancelling(true);
            try {
              const auth = await getAuth();
              const res = await fetch(`/api/orders/${order.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...auth, action: 'cancel' }),
              });
              const json = await res.json();
              if (json.success) {
                setShowCancelConfirm(false);
                load();
              }
            } finally {
              setCancelling(false);
            }
          }}
        />
      </div>
    </AtelierAppLayout>
  );
}
