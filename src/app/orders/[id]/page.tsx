'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { atelierHref } from '@/lib/atelier-paths';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { useUsdcPayment } from '@/hooks/use-usdc-payment';
import { getPrivyAccessToken } from '@/lib/privy-client';
import type { ServiceOrder, ServiceReview, OrderStatus, OrderDeliverable, OrderMessage } from '@/lib/atelier-db';

type ViewerRole = 'buyer' | 'seller' | 'admin';

interface OrderData {
  order: ServiceOrder;
  review: ServiceReview | null;
  deliverables: OrderDeliverable[];
  viewer_role?: ViewerRole;
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

function truncateWallet(addr: string | null | undefined): string {
  if (!addr) return '';
  return addr.length > 12 ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : addr;
}

function buyerDisplay(order: ServiceOrder): string | null {
  return (
    order.client_name ||
    order.client_username ||
    (order.client_wallet ? truncateWallet(order.client_wallet) : null) ||
    (order.payer_address ? truncateWallet(order.payer_address) : null)
  );
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
          <p className="text-sm text-neutral-400 break-all">{order.brief}</p>
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
                          onError={(e) => { const el = e.currentTarget.closest('.group'); if (el instanceof HTMLElement) el.style.display = 'none'; }}
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

const VIDEO_WATERMARK_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><text x='10' y='40' font-family='monospace' font-size='13' fill='rgba(255,255,255,0.28)' transform='rotate(-30,100,100)'>ATELIER ATELIER ATELIER</text><text x='-20' y='110' font-family='monospace' font-size='13' fill='rgba(255,255,255,0.28)' transform='rotate(-30,100,100)'>ATELIER ATELIER ATELIER</text><text x='30' y='180' font-family='monospace' font-size='13' fill='rgba(255,255,255,0.28)' transform='rotate(-30,100,100)'>ATELIER ATELIER ATELIER</text></svg>`;
const VIDEO_WATERMARK_URI = `url("data:image/svg+xml,${encodeURIComponent(VIDEO_WATERMARK_SVG)}")`;

function PreviewBadge() {
  return (
    <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/70 border border-neutral-700 pointer-events-none">
      <svg className="w-2.5 h-2.5 text-neutral-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
      <span className="text-2xs font-mono text-neutral-400 leading-none">Preview</span>
    </div>
  );
}

function PreviewUnavailable() {
  return (
    <div className="mt-2 p-4 rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/50 max-w-md">
      <div className="flex items-center gap-2 mb-1">
        <svg className="w-4 h-4 text-neutral-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
        <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Preview</span>
      </div>
      <p className="text-xs font-mono text-neutral-400 dark:text-neutral-500">Preview is being prepared</p>
    </div>
  );
}

function DeliverableMedia({ url, mediaType, locked = false }: { url: string | null; mediaType: string | null; locked?: boolean }) {
  if (!url && locked && mediaType === 'image') return <PreviewUnavailable />;
  if (!url) return null;

  if (mediaType === 'video') {
    return (
      <div className="group relative max-w-md mt-2">
        <video src={url} controls playsInline className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800" />
        {locked ? (
          <>
            <div
              className="absolute inset-0 rounded-lg pointer-events-none"
              style={{ backgroundImage: VIDEO_WATERMARK_URI, backgroundRepeat: 'repeat', backgroundSize: '200px 200px' }}
            />
            <PreviewBadge />
          </>
        ) : (
          <div className="absolute top-2 right-2"><DownloadButton url={url} name="deliverable" /></div>
        )}
      </div>
    );
  }

  if (mediaType === 'link') {
    const hostname = (() => { try { return new URL(url).hostname; } catch { return url; } })();
    return (
      <div className="mt-2 p-4 rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/50 max-w-md">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-atelier dark:text-atelier-bright shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.03a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.374" />
          </svg>
          <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Delivered Link</span>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-atelier-dark hover:text-atelier dark:text-atelier-bright dark:hover:text-atelier-bright font-mono text-sm underline underline-offset-2">
          {hostname}
        </a>
      </div>
    );
  }

  if (mediaType === 'document' || mediaType === 'code' || mediaType === 'text') {
    const labels: Record<string, string> = { code: 'Code Deliverable', document: 'Document', text: 'Text Deliverable' };
    const label = labels[mediaType] || 'Deliverable';
    const ext = url.split('.').pop()?.split('?')[0]?.toUpperCase() || '';
    const linkLabel = ext ? `View Delivery (.${ext.toLowerCase()})` : 'View Delivery';
    return (
      <div className="mt-2 p-4 rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/50 max-w-md">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-atelier dark:text-atelier-bright shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{label}</span>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-atelier-dark hover:text-atelier dark:text-atelier-bright dark:hover:text-atelier-bright font-mono text-sm underline underline-offset-2">
          {linkLabel}
        </a>
        {!locked && <div className="mt-2"><DownloadButton url={url} name="deliverable" /></div>}
      </div>
    );
  }

  return (
    <div className="group relative max-w-md mt-2">
      <img src={url} alt="Deliverable" className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800" />
      {locked ? (
        <PreviewBadge />
      ) : (
        <div className="absolute top-2 right-2"><DownloadButton url={url} name="deliverable" /></div>
      )}
    </div>
  );
}

function ReviewForm({ orderId, buildAuth, onSubmitted }: { orderId: string; buildAuth: () => Promise<Record<string, unknown>>; onSubmitted: () => void }) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (rating === 0) return;
    setSubmitting(true);
    setError(null);

    try {
      const auth = await buildAuth();
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
  }, [buildAuth, orderId, rating, comment, onSubmitted]);

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

function DeliverablesGallery({ deliverables, locked = false }: { deliverables: OrderDeliverable[]; locked?: boolean }) {
  const completed = deliverables.filter(
    (d) => d.status === 'completed' && (d.deliverable_url || (locked && d.deliverable_media_type === 'image')),
  );
  if (completed.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-mono text-neutral-400">
        Deliverables ({completed.length})
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {completed.map((d) => (
          <div
            key={d.id}
            className="group relative rounded-lg border border-neutral-800 overflow-hidden bg-black"
          >
            {d.deliverable_media_type === 'video' ? (
              <>
                <video
                  src={d.deliverable_url!}
                  controls
                  playsInline
                  className="w-full aspect-square object-cover"
                />
                {locked ? (
                  <>
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{ backgroundImage: VIDEO_WATERMARK_URI, backgroundRepeat: 'repeat', backgroundSize: '200px 200px' }}
                    />
                    <PreviewBadge />
                  </>
                ) : (
                  <div className="absolute top-2 right-2">
                    <DownloadButton url={d.deliverable_url!} name="deliverable" />
                  </div>
                )}
              </>
            ) : d.deliverable_media_type === 'image' || !d.deliverable_media_type ? (
              <>
                {!d.deliverable_url && locked ? (
                  <div className="w-full aspect-square flex flex-col items-center justify-center gap-2 p-4">
                    <svg className="w-5 h-5 text-neutral-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                    <span className="text-2xs font-mono text-neutral-500 uppercase tracking-wider">Preview</span>
                    <span className="text-2xs font-mono text-neutral-600 text-center">Preview is being prepared</span>
                  </div>
                ) : (
                  <>
                    <img
                      src={d.deliverable_url!}
                      alt="Deliverable"
                      className="w-full aspect-square object-cover"
                    />
                    {locked ? (
                      <PreviewBadge />
                    ) : (
                      <div className="absolute top-2 right-2">
                        <DownloadButton url={d.deliverable_url!} name="deliverable" />
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <div className="w-full aspect-square flex flex-col items-center justify-center gap-2 p-3">
                  <svg className="w-6 h-6 text-atelier-bright" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.03a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.374" />
                  </svg>
                  <a href={d.deliverable_url!} target="_blank" rel="noopener noreferrer" className="text-atelier-bright hover:text-atelier-bright text-xs font-mono text-center break-all underline underline-offset-2">
                    {d.deliverable_media_type}
                  </a>
                </div>
                {locked ? (
                  <PreviewBadge />
                ) : (
                  <div className="absolute top-2 right-2">
                    <DownloadButton url={d.deliverable_url!} name="deliverable" />
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
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
  const { walletAddress, getAuth, atelierUser } = useAtelierAuth();

  const walletMatches = !!walletAddress && order.client_wallet === walletAddress;
  const isOrderClient = walletMatches
    || (!!atelierUser?.privy_user_id && !!order.user_id && order.user_id === atelierUser.privy_user_id)
    || (atelierUser?.google_email ?? atelierUser?.email ?? '').toLowerCase() === 'rempxbt@gmail.com';

  const buildOrderAuth = async (): Promise<Record<string, unknown>> => {
    if (walletMatches) {
      try {
        return { ...(await getAuth()) };
      } catch {
        // Connected wallet can't sign; fall back to Privy identity below.
      }
    }
    const token = await getPrivyAccessToken();
    if (token) return { privy_access_token: token };
    return { ...(await getAuth()) };
  };
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

  const handleApprove = async () => {
    if (!isOrderClient) return;
    setApproving(true);
    try {
      const auth = await buildOrderAuth();
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
  };

  return (
    <div className="space-y-6">
      {/* Brief context */}
      {order.brief && (
        <div className="p-3 rounded bg-atelier/5 border border-atelier/10">
          <p className="text-2xs font-mono text-neutral-500 mb-1">Project brief</p>
          <p className="text-sm text-neutral-300 break-all">{order.brief}</p>
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
                          onError={(e) => { const el = e.currentTarget.closest('.group'); if (el instanceof HTMLElement) el.style.display = 'none'; }}
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
      {order.status === 'delivered' && isOrderClient && (
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
                        <svg className="w-6 h-6 text-atelier-bright" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.03a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.374" />
                        </svg>
                        <a href={d.deliverable_url} target="_blank" rel="noopener noreferrer" className="text-atelier-bright hover:text-atelier-bright text-xs font-mono text-center break-all underline underline-offset-2">
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

interface DeliveryInfo {
  url: string;
  mediaType: string | null;
  deliveredAt: string | null;
  revisionCount: number;
}

function DeliveryCard({ delivery, index, locked = false }: { delivery: DeliveryInfo; index: number; locked?: boolean }) {
  return (
    <div className="flex justify-start my-3">
      <div className="max-w-[85%] rounded-lg border border-atelier/20 bg-white dark:bg-black-soft overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-atelier/10">
          <svg className="w-3.5 h-3.5 text-atelier shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <span className="text-2xs font-mono font-semibold text-atelier uppercase tracking-wider">Delivery #{index}</span>
          {delivery.deliveredAt && (
            <span className="text-2xs font-mono text-neutral-500 ml-auto">
              {new Date(delivery.deliveredAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div className="p-3">
          <DeliverableMedia url={delivery.url} mediaType={delivery.mediaType} locked={locked} />
        </div>
      </div>
    </div>
  );
}

interface ChatAuth {
  token?: string;
  sig?: { wallet: string; wallet_sig: string; wallet_sig_ts: string };
}

function OrderChat({ orderId, selfIds, deliveries, buildAuth, locked = false }: {
  orderId: string;
  selfIds: string[];
  deliveries: DeliveryInfo[];
  buildAuth: () => Promise<ChatAuth>;
  locked?: boolean;
}) {
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const auth = await buildAuth();
      const qs = auth.sig ? `?${new URLSearchParams(auth.sig)}` : '';
      const res = await fetch(`/api/orders/${orderId}/messages${qs}`, {
        credentials: 'include',
        headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {},
      });
      const json = await res.json();
      if (json.success) {
        setMessages(json.data);
      }
    } catch {
      // silent — includes expired auth sessions
    }
  }, [orderId, buildAuth]);

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
      const auth = await buildAuth();
      const res = await fetch(`/api/orders/${orderId}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
        },
        body: JSON.stringify({
          ...(auth.sig ?? {}),
          ...(auth.token ? { privy_access_token: auth.token } : {}),
          content: input.trim(),
        }),
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
  }, [orderId, buildAuth, input, sending]);

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
        {messages.map((msg, idx) => {
          const isMe = selfIds.includes(msg.sender_id);
          const msgDate = new Date(msg.created_at);
          const prevDate = idx > 0 ? new Date(messages[idx - 1].created_at) : null;
          const showDateSep = !prevDate || msgDate.toDateString() !== prevDate.toDateString();
          const timeStr = msgDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          return (
            <div key={msg.id}>
              {showDateSep && (
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800" />
                  <span className="text-2xs font-mono text-neutral-400 shrink-0">
                    {msgDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800" />
                </div>
              )}
              <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-lg px-3 py-2 ${
                  isMe
                    ? 'bg-atelier/20 text-black dark:text-white'
                    : 'bg-white dark:bg-black-soft border border-neutral-200 dark:border-neutral-800 text-black dark:text-white'
                }`}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-2xs font-mono text-neutral-500">
                      {msg.sender_name || (isMe ? 'You' : msg.sender_type)}
                    </p>
                    <p className="text-2xs font-mono text-neutral-600">{timeStr}</p>
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                </div>
              </div>
            </div>
          );
        })}
        {deliveries.map((d, i) => (
          <DeliveryCard key={`delivery-${i}`} delivery={d} index={i + 1} locked={locked} />
        ))}
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
  const { ready, authenticated, walletAddress, getAuth, atelierUser } = useAtelierAuth();
  const { payUsdc } = useUsdcPayment();
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
  const [retryingPayout, setRetryingPayout] = useState(false);
  const [retryPayoutMsg, setRetryPayoutMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const token = await getPrivyAccessToken();
      const res = await fetch(`/api/orders/${params.id}`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'Order not found');
        return;
      }
      setData(json.data);
      setError(null);
    } catch {
      setError('Failed to load order');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  const buildChatAuth = useCallback(async (): Promise<ChatAuth> => {
    const out: ChatAuth = {};
    try {
      const token = await getPrivyAccessToken();
      if (token) out.token = token;
    } catch { /* no Privy token */ }
    try {
      const a = await getAuth({ silent: true });
      out.sig = { wallet: a.wallet, wallet_sig: a.wallet_sig, wallet_sig_ts: String(a.wallet_sig_ts) };
    } catch { /* no signable wallet */ }
    return out;
  }, [getAuth]);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, authenticated, load]);

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

  if (data.viewer_role === 'seller') {
    return <SellerOrderView data={data} onRefresh={load} buildChatAuth={buildChatAuth} />;
  }

  const isWorkspace = order.quota_total > 0;
  const isTerminal = order.status === 'cancelled' || order.status === 'disputed';
  const showWorkspace = isWorkspace && ['in_progress', 'delivered', 'completed'].includes(order.status);

  const walletMatches = !!walletAddress && order.client_wallet === walletAddress;
  const isOrderClient = walletMatches
    || (!!atelierUser?.privy_user_id && !!order.user_id && order.user_id === atelierUser.privy_user_id)
    || (atelierUser?.google_email ?? atelierUser?.email ?? '').toLowerCase() === 'rempxbt@gmail.com';
  const walletMismatch = isOrderClient && !walletMatches;
  const locked = isOrderClient && order.status !== 'completed';

  const buildOrderAuth = async (): Promise<Record<string, unknown>> => {
    if (walletMatches) {
      try {
        return { ...(await getAuth()) };
      } catch {
        // Connected wallet can't sign; fall back to Privy identity below.
      }
    }
    const token = await getPrivyAccessToken();
    if (token) return { privy_access_token: token };
    return { ...(await getAuth()) };
  };

  const canCancel = ['pending_quote', 'quoted', 'accepted', 'paid'].includes(order.status) && isOrderClient;

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
                    <span className="text-neutral-500 font-mono text-2xs">Ordered</span>
                    <span className="text-black dark:text-white text-xs font-mono">{formatDate(order.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500 font-mono text-2xs">Provider</span>
                    <Link href={atelierHref(`/atelier/agents/${order.provider_slug || order.provider_agent_id}`)} className="text-atelier hover:underline text-xs font-mono">
                      {order.provider_name}
                    </Link>
                  </div>
                  {buyerDisplay(order) && (
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500 font-mono text-2xs">Client</span>
                      <span className="text-black dark:text-white text-xs font-mono">{buyerDisplay(order)}</span>
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
                  <p className="text-sm text-gray-700 dark:text-neutral-300 leading-relaxed break-all">{order.brief}</p>
                  {order.reference_images && (() => {
                    try {
                      const images: string[] = JSON.parse(order.reference_images);
                      if (images.length === 0) return null;
                      return (
                        <div className="flex gap-2 mt-3 flex-wrap">
                          {images.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                              <img src={url} alt={`Reference ${i + 1}`} className="w-12 h-12 rounded border border-neutral-800 object-cover hover:border-atelier transition-colors" onError={(e) => { const el = e.currentTarget.closest('a'); if (el instanceof HTMLElement) el.style.display = 'none'; }} />
                            </a>
                          ))}
                        </div>
                      );
                    } catch { return null; }
                  })()}
                </div>
              )}

              {order.requirement_answers && (() => {
                try {
                  const answers: Record<string, string> = JSON.parse(order.requirement_answers);
                  const entries = Object.entries(answers).filter(([, v]) => v?.trim());
                  if (entries.length === 0) return null;
                  return (
                    <div className="p-4 rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0a0a0a]">
                      <p className="text-2xs font-mono text-neutral-500 uppercase tracking-wider mb-2">Requirements</p>
                      <div className="space-y-2">
                        {entries.map(([label, value]) => (
                          <div key={label}>
                            <p className="text-2xs font-mono text-neutral-500">{label}</p>
                            <p className="text-sm text-gray-700 dark:text-neutral-300">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                } catch { return null; }
              })()}

              {/* Timeline Progress */}
              <div className="p-4 rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0a0a0a]">
                <p className="text-2xs font-mono text-neutral-500 uppercase tracking-wider mb-4">Progress</p>
                <div className="relative ml-1">
                  {(() => {
                    const currentIdx = statusIndex(order.status);
                    const steps = STATUS_SEQUENCE.map((s, i) => {
                      const isDone = i < currentIdx || (i === currentIdx && order.status === 'completed');
                      const isCurrent = i === currentIdx && order.status !== 'completed';
                      const isRevisionStep = order.status === 'revision_requested' && s === 'delivered';
                      return { key: s, label: STATUS_LABELS[s], isDone: isDone || isRevisionStep, isCurrent, isTerminalStep: false, isRevisionStep: false };
                    });
                    if (order.status === 'revision_requested') {
                      steps.push({ key: 'revision_requested', label: 'Revision Requested', isDone: false, isCurrent: true, isTerminalStep: false, isRevisionStep: true });
                    }
                    if (isTerminal) {
                      steps.push({ key: order.status, label: order.status === 'cancelled' ? 'Cancelled' : 'Disputed', isDone: true, isCurrent: false, isTerminalStep: true, isRevisionStep: false });
                    }
                    return steps.map((step, i) => {
                      const isLast = i === steps.length - 1;
                      return (
                        <div key={step.key} className="flex items-start gap-3 relative">
                          <div className="flex flex-col items-center w-4 shrink-0">
                            <div className="flex items-center justify-center w-4 h-4">
                              {step.isTerminalStep ? (
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500 dark:bg-red-400" />
                              ) : step.isCurrent ? (
                                <div className="w-2.5 h-2.5 rounded-full bg-atelier animate-pulse-atelier ring-[3px] ring-atelier/20" />
                              ) : step.isDone ? (
                                <svg className="w-4 h-4 text-atelier" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                              ) : (
                                <div className="w-2 h-2 rounded-full border-[1.5px] border-gray-300 dark:border-neutral-600" />
                              )}
                            </div>
                            {!isLast && (
                              <div className={`w-px h-4 ${step.isDone ? 'bg-atelier/30' : 'bg-gray-200 dark:bg-neutral-800'}`} />
                            )}
                          </div>
                          <span className={`text-xs font-mono leading-4 ${
                            step.isTerminalStep ? 'text-red-600 dark:text-red-400 font-medium' :
                            step.isRevisionStep ? 'text-amber-600 dark:text-amber-400 font-medium' :
                            step.isCurrent ? 'text-gray-900 dark:text-white font-medium' :
                            step.isDone ? 'text-gray-500 dark:text-neutral-400' : 'text-gray-300 dark:text-neutral-600'
                          }`}>{step.label}</span>
                        </div>
                      );
                    });
                  })()}
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
                          const txSig = await payUsdc({ chain: 'solana', treasury: treasuryWallet, amountUsd: total });
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
                {order.status === 'delivered' && isOrderClient && (
                  <>
                    {walletMismatch && (
                      <p className="text-2xs font-mono text-amber-500/90 px-2.5 py-2 rounded border border-amber-400/20 bg-amber-400/5 leading-relaxed">
                        Connected wallet differs from the one used to place this order. You can still approve — releasing payment to the agent doesn&apos;t require your wallet.
                      </p>
                    )}
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
                    href={atelierHref(`/atelier/agents/${order.provider_slug || order.provider_agent_id}`)}
                    className="w-full py-2.5 rounded border border-atelier text-atelier text-sm font-medium font-mono tracking-wide transition-all duration-200 hover:bg-atelier hover:text-white flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
                    </svg>
                    Hire {order.provider_name} Again
                  </Link>
                )}

                {/* Admin: Retry Payout */}
                {order.status === 'completed' && !order.payout_tx_hash && walletAddress === 'EZkoXXZ5HEWdKwfv7wua7k6Dqv8aQxxHWNakq2gG2Qpb' && (
                  <div className="p-3 rounded-lg border border-amber-400/30 bg-amber-400/5">
                    <p className="text-2xs font-mono text-amber-400/70 mb-2">Payout missing for this order</p>
                    {retryPayoutMsg && (
                      <p className={`text-2xs font-mono mb-2 ${retryPayoutMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
                        {retryPayoutMsg}
                      </p>
                    )}
                    <button
                      onClick={async () => {
                        const adminKey = prompt('Admin key:');
                        if (!adminKey) return;
                        setRetryingPayout(true);
                        setRetryPayoutMsg(null);
                        try {
                          const res = await fetch(`/api/orders/${order.id}/retry-payout`, {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${adminKey}` },
                          });
                          const json = await res.json();
                          if (json.success) {
                            setRetryPayoutMsg(`Payout sent: ${json.data.tx_hash}`);
                            load();
                          } else {
                            setRetryPayoutMsg(`Error: ${json.error}`);
                          }
                        } catch (e) {
                          setRetryPayoutMsg(`Error: ${e instanceof Error ? e.message : 'Failed'}`);
                        } finally {
                          setRetryingPayout(false);
                        }
                      }}
                      disabled={retryingPayout}
                      className="w-full py-2 rounded border border-amber-400 text-amber-400 text-xs font-mono font-medium hover:bg-amber-400/10 disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center gap-2"
                    >
                      {retryingPayout ? (
                        <>
                          <div className="w-3 h-3 border-2 border-amber-400/40 border-t-amber-400 rounded-full animate-spin" />
                          Processing...
                        </>
                      ) : (
                        'Retry Payout'
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Support */}
              <a
                href="https://t.me/atelierai"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-2xs font-mono text-neutral-500 hover:text-atelier transition-colors py-2"
              >
                Need help?
              </a>
            </div>
          </div>

          {/* === MAIN CONTENT (second on mobile, left column on desktop) === */}
          <div className="lg:order-first min-w-0 space-y-6">
            <StatusBanner order={order} />

            {showWorkspace && (
              <WorkspaceView data={data} onRefresh={load} />
            )}

            {/* Deliverables gallery for standard (non-workspace) orders */}
            {!showWorkspace && data.deliverables.length > 0 && (
              <DeliverablesGallery deliverables={data.deliverables} locked={locked} />
            )}

            {review && <ReviewInline review={review} />}

            {/* Revision form */}
            {showRevisionForm && order.status === 'delivered' && isOrderClient && (
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
                        const auth = await buildOrderAuth();
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
            {showDisputeForm && order.status === 'delivered' && isOrderClient && (
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
                        const auth = await buildOrderAuth();
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
            {order.status === 'completed' && !review && isOrderClient && (
              <div>
                <div className="p-4 rounded-lg border border-atelier/20 bg-atelier/5 mb-2">
                  <p className="text-sm font-mono text-atelier mb-1">How was your experience?</p>
                  <p className="text-xs text-neutral-500">Your review helps other buyers find great agents.</p>
                </div>
                <ReviewForm orderId={order.id} buildAuth={buildOrderAuth} onSubmitted={load} />
              </div>
            )}

            {/* Chat — always visible */}
            {walletAddress && !['pending_quote', 'quoted', 'accepted'].includes(order.status) && (
              <OrderChat
                orderId={order.id}
                selfIds={[walletAddress]}
                buildAuth={buildChatAuth}
                locked={locked}
                deliveries={data.deliverables.length > 0
                  ? data.deliverables
                      .filter((d) => d.status === 'completed' && d.deliverable_url)
                      .map((d) => ({
                        url: d.deliverable_url!,
                        mediaType: d.deliverable_media_type,
                        deliveredAt: d.created_at,
                        revisionCount: 0,
                      }))
                  : order.deliverable_url ? [{
                      url: order.deliverable_url,
                      mediaType: order.deliverable_media_type,
                      deliveredAt: order.delivered_at,
                      revisionCount: order.revision_count,
                    }] : []
                }
              />
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
              const auth = await buildOrderAuth();
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
              const auth = await buildOrderAuth();
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

const DELIVER_MEDIA_TYPES = ['image', 'video', 'link', 'document', 'code', 'text'] as const;
type DeliverMediaType = typeof DELIVER_MEDIA_TYPES[number];

interface DeliverItem {
  deliverable_url: string;
  deliverable_media_type: DeliverMediaType;
}

function SellerQuoteForm({ orderId, buildAuth, onDone }: {
  orderId: string;
  buildAuth: () => Promise<Record<string, unknown>>;
  onDone: () => void;
}) {
  const [price, setPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    const value = parseFloat(price);
    if (isNaN(value) || value <= 0) { setError('Enter a valid price'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const auth = await buildAuth();
      const res = await fetch(`/api/orders/${orderId}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...auth, price_usd: value.toFixed(2) }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || 'Failed to send quote'); return; }
      onDone();
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }, [price, buildAuth, orderId, onDone]);

  return (
    <div className="p-5 rounded-lg border border-atelier/20 bg-atelier/5">
      <h3 className="text-sm font-bold font-display text-black dark:text-white mb-1">Send a quote</h3>
      <p className="text-xs text-neutral-500 font-mono mb-4">Price the buyer&apos;s brief. They pay this amount (plus platform fee) to start.</p>
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 font-mono text-sm">$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            className="w-full pl-7 pr-3 py-2.5 rounded bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 text-black dark:text-white text-sm font-mono focus:outline-none focus:border-atelier"
          />
        </div>
        <span className="text-xs font-mono text-neutral-500">USDC</span>
      </div>
      {error && <p className="text-xs text-red-400 font-mono mb-2">{error}</p>}
      <button
        onClick={submit}
        disabled={!price || submitting}
        className="w-full py-2.5 rounded border border-atelier text-atelier text-sm font-medium font-mono tracking-wide disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:bg-atelier hover:text-white flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <div className="w-4 h-4 border-2 border-atelier/40 border-t-atelier rounded-full animate-spin" />
            Sending...
          </>
        ) : 'Send Quote'}
      </button>
    </div>
  );
}

function SellerDeliverForm({ orderId, buildAuth, buildUploadAuth, revisionRequested, onDone }: {
  orderId: string;
  buildAuth: () => Promise<Record<string, unknown>>;
  buildUploadAuth: () => Promise<{ headers: Record<string, string>; query: string }>;
  revisionRequested: boolean;
  onDone: () => void;
}) {
  const [items, setItems] = useState<DeliverItem[]>([]);
  const [url, setUrl] = useState('');
  const [mediaType, setMediaType] = useState<DeliverMediaType>('image');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addUrl = useCallback(() => {
    const trimmed = url.trim();
    if (!trimmed) return;
    try { new URL(trimmed); } catch { setError('Enter a valid URL'); return; }
    setItems((prev) => [...prev, { deliverable_url: trimmed, deliverable_media_type: mediaType }]);
    setUrl('');
    setError(null);
  }, [url, mediaType]);

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const auth = await buildUploadAuth();
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/orders/${orderId}/upload${auth.query}`, {
        method: 'POST',
        headers: auth.headers,
        credentials: 'include',
        body: form,
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || 'Upload failed'); return; }
      setItems((prev) => [...prev, {
        deliverable_url: json.data.url,
        deliverable_media_type: json.data.media_type as DeliverMediaType,
      }]);
    } catch {
      setError('Upload failed');
    } finally {
      setUploading(false);
    }
  }, [buildUploadAuth, orderId]);

  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const submit = useCallback(async () => {
    if (items.length === 0) { setError('Add at least one deliverable'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const auth = await buildAuth();
      const res = await fetch(`/api/orders/${orderId}/deliver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...auth, deliverables: items }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || 'Failed to deliver'); return; }
      onDone();
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }, [items, buildAuth, orderId, onDone]);

  return (
    <div className="p-5 rounded-lg border border-atelier/20 bg-atelier/5">
      <h3 className="text-sm font-bold font-display text-black dark:text-white mb-1">
        {revisionRequested ? 'Submit revised work' : 'Deliver work'}
      </h3>
      <p className="text-xs text-neutral-500 font-mono mb-4">
        Upload a file or paste a link. You can add more than one deliverable.
      </p>

      {items.length > 0 && (
        <div className="space-y-2 mb-4">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black">
              <span className="text-2xs font-mono px-1.5 py-0.5 rounded bg-atelier/10 text-atelier uppercase shrink-0">{it.deliverable_media_type}</span>
              <span className="text-xs font-mono text-neutral-600 dark:text-neutral-400 truncate flex-1">{it.deliverable_url}</span>
              <button onClick={() => removeItem(i)} className="text-neutral-400 hover:text-red-400 shrink-0" title="Remove">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } }}
          placeholder="Paste a delivery URL..."
          className="flex-1 px-3 py-2 rounded bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 text-black dark:text-white text-sm font-mono placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-atelier"
        />
        <select
          value={mediaType}
          onChange={(e) => setMediaType(e.target.value as DeliverMediaType)}
          className="px-3 py-2 rounded bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 text-black dark:text-white text-sm font-mono focus:outline-none focus:border-atelier"
        >
          {DELIVER_MEDIA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button
          onClick={addUrl}
          disabled={!url.trim()}
          className="px-4 py-2 rounded border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 text-sm font-mono hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 transition-colors"
        >
          Add
        </button>
      </div>

      <label className="flex items-center justify-center gap-2 w-full py-2 mb-4 rounded border border-dashed border-neutral-300 dark:border-neutral-700 text-neutral-500 text-xs font-mono cursor-pointer hover:border-atelier hover:text-atelier transition-colors">
        {uploading ? (
          <>
            <div className="w-3.5 h-3.5 border-2 border-atelier/40 border-t-atelier rounded-full animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 7.5L12 3m0 0L7.5 7.5M12 3v13.5" />
            </svg>
            Upload a file (max 50MB)
          </>
        )}
        <input
          type="file"
          className="hidden"
          disabled={uploading}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }}
        />
      </label>

      {error && <p className="text-xs text-red-400 font-mono mb-2">{error}</p>}
      <button
        onClick={submit}
        disabled={items.length === 0 || submitting}
        className="w-full py-2.5 rounded border border-atelier text-atelier text-sm font-medium font-mono tracking-wide disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:bg-atelier hover:text-white flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <div className="w-4 h-4 border-2 border-atelier/40 border-t-atelier rounded-full animate-spin" />
            Delivering...
          </>
        ) : revisionRequested ? 'Submit Revision' : 'Deliver to Buyer'}
      </button>
    </div>
  );
}

function SellerOrderView({ data, onRefresh, buildChatAuth }: {
  data: OrderData;
  onRefresh: () => void;
  buildChatAuth: () => Promise<ChatAuth>;
}) {
  const { order } = data;
  const { getAuth } = useAtelierAuth();
  const [retrying, setRetrying] = useState(false);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);

  const buildProviderBody = useCallback(async (): Promise<Record<string, unknown>> => {
    const token = await getPrivyAccessToken();
    if (token) return { privy_access_token: token };
    return { ...(await getAuth()) };
  }, [getAuth]);

  const buildUploadAuth = useCallback(async (): Promise<{ headers: Record<string, string>; query: string }> => {
    const token = await getPrivyAccessToken();
    if (token) return { headers: { Authorization: `Bearer ${token}` }, query: '' };
    const a = await getAuth();
    const q = new URLSearchParams({ wallet: a.wallet, wallet_sig: a.wallet_sig, wallet_sig_ts: String(a.wallet_sig_ts) });
    return { headers: {}, query: `?${q}` };
  }, [getAuth]);

  const quoted = parseFloat(order.quoted_price_usd || '0');
  const fee = parseFloat(order.platform_fee_usd || '0');
  const net = Math.max(0, Math.round((quoted - fee) * 100) / 100);

  const canDeliver = ['paid', 'in_progress', 'revision_requested', 'disputed'].includes(order.status);
  const showChat = !['pending_quote', 'quoted', 'accepted'].includes(order.status);

  const requestPayoutRetry = useCallback(async () => {
    setRetrying(true);
    setRetryMsg(null);
    try {
      const token = await getPrivyAccessToken();
      const res = await fetch(`/api/orders/${order.id}/request-payout-retry`, {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      setRetryMsg(json.success ? 'Payout retry requested. The team will process it shortly.' : `Error: ${json.error}`);
    } catch {
      setRetryMsg('Error: request failed');
    } finally {
      setRetrying(false);
    }
  }, [order.id]);

  const references: string[] = (() => {
    try { return order.reference_images ? JSON.parse(order.reference_images) : []; } catch { return []; }
  })();
  const requirements: [string, string][] = (() => {
    try {
      const a: Record<string, string> = order.requirement_answers ? JSON.parse(order.requirement_answers) : {};
      return Object.entries(a).filter(([, v]) => v?.trim());
    } catch { return []; }
  })();

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
          Orders
        </Link>

        <div className="flex flex-col lg:grid lg:grid-cols-[1fr_360px] lg:gap-8">
          {/* Sidebar */}
          <div className="lg:order-last mb-6 lg:mb-0">
            <div className="lg:sticky lg:top-20 space-y-3">
              <div className="p-4 rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0a0a0a]">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xs font-mono px-2 py-0.5 rounded-full bg-atelier/10 text-atelier uppercase tracking-wider">Selling</span>
                  <span className={`shrink-0 inline-flex px-2.5 py-0.5 rounded-full text-2xs font-mono font-medium ${STATUS_COLORS[order.status] || 'bg-neutral-800 text-neutral-300'}`}>
                    {STATUS_LABELS[order.status] || order.status}
                  </span>
                </div>
                <h1 className="text-base font-bold font-display truncate">{order.service_title}</h1>
                <p className="text-2xs font-mono text-neutral-500 mt-0.5 mb-3">{order.id}</p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500 font-mono text-2xs">Ordered</span>
                    <span className="text-black dark:text-white text-xs font-mono">{formatDate(order.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500 font-mono text-2xs">Buyer</span>
                    <span className="text-black dark:text-white text-xs font-mono">{buyerDisplay(order) || 'Unknown'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500 font-mono text-2xs">Seller</span>
                    <Link href={atelierHref(`/atelier/agents/${order.provider_slug || order.provider_agent_id}`)} className="text-atelier hover:underline text-xs font-mono">
                      {order.provider_name}
                    </Link>
                  </div>
                  {quoted > 0 && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-500 font-mono text-2xs">Quote</span>
                        <span className="text-black dark:text-white text-xs font-mono">${quoted.toFixed(2)} USDC</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-500 font-mono text-2xs">Platform fee</span>
                        <span className="text-neutral-500 text-xs font-mono">-${fee.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-neutral-200 dark:border-neutral-800">
                        <span className="text-neutral-500 font-mono text-2xs">You earn</span>
                        <span className="text-emerald-500 text-xs font-mono font-bold">${net.toFixed(2)} USDC</span>
                      </div>
                    </>
                  )}
                  {order.payout_tx_hash && (
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500 font-mono text-2xs">Payout</span>
                      <span className="text-atelier-bright text-2xs font-mono">{truncateId(order.payout_tx_hash)}</span>
                    </div>
                  )}
                </div>
              </div>

              {order.brief && (
                <div className="p-4 rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0a0a0a]">
                  <p className="text-2xs font-mono text-neutral-500 uppercase tracking-wider mb-2">Brief</p>
                  <p className="text-sm text-gray-700 dark:text-neutral-300 leading-relaxed break-all">{order.brief}</p>
                  {references.length > 0 && (
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {references.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                          <img src={url} alt={`Reference ${i + 1}`} className="w-12 h-12 rounded border border-neutral-800 object-cover hover:border-atelier transition-colors" onError={(e) => { const el = e.currentTarget.closest('a'); if (el instanceof HTMLElement) el.style.display = 'none'; }} />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {requirements.length > 0 && (
                <div className="p-4 rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#0a0a0a]">
                  <p className="text-2xs font-mono text-neutral-500 uppercase tracking-wider mb-2">Requirements</p>
                  <div className="space-y-2">
                    {requirements.map(([label, value]) => (
                      <div key={label}>
                        <p className="text-2xs font-mono text-neutral-500">{label}</p>
                        <p className="text-sm text-gray-700 dark:text-neutral-300">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <a
                href="https://t.me/atelierai"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-2xs font-mono text-neutral-500 hover:text-atelier transition-colors py-2"
              >
                Need help?
              </a>
            </div>
          </div>

          {/* Main */}
          <div className="lg:order-first min-w-0 space-y-6">
            {order.status === 'pending_quote' && (
              <SellerQuoteForm orderId={order.id} buildAuth={buildProviderBody} onDone={onRefresh} />
            )}

            {(order.status === 'quoted' || order.status === 'accepted') && (
              <div className="p-4 rounded-lg border border-atelier/20 bg-atelier/5">
                <p className="text-sm font-mono text-atelier">
                  Quote sent (${quoted.toFixed(2)}). Waiting for the buyer to accept and pay.
                </p>
              </div>
            )}

            {order.status === 'revision_requested' && (
              <div className="p-4 rounded-lg border border-amber-400/20 bg-amber-400/5">
                <p className="text-sm font-mono text-amber-400">
                  The buyer requested a revision ({order.revision_count}/{order.max_revisions} used). See the chat below for details, then re-deliver.
                </p>
              </div>
            )}

            {order.status === 'disputed' && (
              <div className="p-4 rounded-lg border border-red-400/20 bg-red-400/5">
                <p className="text-sm font-mono text-red-400">
                  The buyer opened a dispute. Review the chat and re-deliver, or contact support.
                </p>
              </div>
            )}

            {canDeliver && (
              <SellerDeliverForm
                orderId={order.id}
                buildAuth={buildProviderBody}
                buildUploadAuth={buildUploadAuth}
                revisionRequested={order.status === 'revision_requested'}
                onDone={onRefresh}
              />
            )}

            {order.status === 'delivered' && (
              <div className="p-4 rounded-lg border border-emerald-400/20 bg-emerald-400/5">
                <p className="text-sm font-mono text-emerald-400">
                  Delivered. Waiting for the buyer to approve and release payment.
                </p>
              </div>
            )}

            {order.status === 'completed' && (
              <div className="p-5 rounded-lg border border-emerald-400/20 bg-emerald-400/5">
                <p className="text-sm font-mono text-emerald-400 mb-1">Order complete.</p>
                <p className="text-2xl font-display font-bold text-black dark:text-white">${net.toFixed(2)} <span className="text-sm font-mono text-neutral-500">USDC earned</span></p>
                {order.payout_tx_hash ? (
                  <p className="text-2xs font-mono text-neutral-500 mt-2">Payout sent: <span className="text-atelier-bright">{truncateId(order.payout_tx_hash)}</span></p>
                ) : (
                  <div className="mt-3">
                    <p className="text-2xs font-mono text-amber-400/80 mb-2">Payout pending.</p>
                    {retryMsg && <p className={`text-2xs font-mono mb-2 ${retryMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>{retryMsg}</p>}
                    <button
                      onClick={requestPayoutRetry}
                      disabled={retrying}
                      className="py-2 px-4 rounded border border-amber-400/40 text-amber-400 text-xs font-mono hover:bg-amber-400/10 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                      {retrying ? 'Requesting...' : 'Request Payout Retry'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {order.status === 'cancelled' && (
              <div className="p-4 rounded-lg border border-red-400/20 bg-red-400/5">
                <p className="text-sm font-mono text-red-400">This order was cancelled.</p>
              </div>
            )}

            {data.deliverables.length > 0 && <DeliverablesGallery deliverables={data.deliverables} />}

            {showChat && (
              <OrderChat
                orderId={order.id}
                selfIds={[order.provider_agent_id]}
                buildAuth={buildChatAuth}
                deliveries={data.deliverables
                  .filter((d) => d.status === 'completed' && d.deliverable_url)
                  .map((d) => ({
                    url: d.deliverable_url!,
                    mediaType: d.deliverable_media_type,
                    deliveredAt: d.created_at,
                    revisionCount: 0,
                  }))}
              />
            )}
          </div>
        </div>
      </div>
    </AtelierAppLayout>
  );
}
