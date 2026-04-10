'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { clientUpload } from '@/lib/client-upload';
import type { ServiceCategory } from '@/lib/atelier-db';
import { CATEGORY_LABELS } from '@/components/atelier/constants';

interface CreateBountyModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const CATEGORIES: { value: ServiceCategory; label: string }[] = (
  Object.entries(CATEGORY_LABELS) as [ServiceCategory | 'all', string][]
)
  .filter(([k]) => k !== 'all')
  .map(([value, label]) => ({ value: value as ServiceCategory, label }));

const DEADLINE_OPTIONS = [
  { value: 1, label: '1 hour' },
  { value: 6, label: '6 hours' },
  { value: 12, label: '12 hours' },
  { value: 24, label: '24 hours' },
  { value: 48, label: '2 days' },
  { value: 72, label: '3 days' },
  { value: 168, label: '7 days' },
];

const CLAIM_WINDOW_OPTIONS = [
  { value: 6, label: '6 hours' },
  { value: 12, label: '12 hours' },
  { value: 24, label: '24 hours' },
  { value: 48, label: '2 days' },
  { value: 72, label: '3 days' },
  { value: 168, label: '7 days' },
];

const MAX_REFERENCE_IMAGES = 3;
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime',
];

interface ReferenceImage {
  url: string;
  name: string;
  uploading: boolean;
}

export function CreateBountyModal({ open, onClose, onCreated }: CreateBountyModalProps) {
  const { walletAddress, authenticated, getAuth, login } = useAtelierAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [category, setCategory] = useState<ServiceCategory>('image_gen');
  const [budgetUsd, setBudgetUsd] = useState('');
  const [deadlineHours, setDeadlineHours] = useState(24);
  const [claimWindowHours, setClaimWindowHours] = useState(24);
  const [referenceUrls, setReferenceUrls] = useState<string[]>(['']);
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setBrief('');
      setCategory('image_gen');
      setBudgetUsd('');
      setDeadlineHours(24);
      setClaimWindowHours(24);
      setReferenceUrls(['']);
      setReferenceImages([]);
      setError(null);
      setLoading(false);
    }
  }, [open]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    e.target.value = '';

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Allowed: JPEG, PNG, WebP, GIF, MP4, WebM, MOV');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('File must be under 50MB');
      return;
    }
    if (referenceImages.length >= MAX_REFERENCE_IMAGES) {
      setError(`Maximum ${MAX_REFERENCE_IMAGES} files allowed`);
      return;
    }

    setError(null);
    const placeholder: ReferenceImage = { url: '', name: file.name, uploading: true };
    setReferenceImages(prev => [...prev, placeholder]);
    const idx = referenceImages.length;

    try {
      const auth = await getAuth();
      const { url } = await clientUpload({
        file,
        auth,
        prefix: 'atelier-orders/briefs',
      });

      setReferenceImages(prev => prev.map((img, i) => i === idx ? { url, name: file.name, uploading: false } : img));
    } catch (err) {
      setReferenceImages(prev => prev.filter((_, i) => i !== idx));
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  }, [referenceImages.length, getAuth]);

  const handleSubmit = useCallback(async () => {
    if (!walletAddress) {
      login();
      return;
    }

    setError(null);

    if (title.length < 3 || title.length > 100) {
      setError('Title must be 3-100 characters');
      return;
    }
    if (brief.length < 10 || brief.length > 2000) {
      setError('Brief must be 10-2000 characters');
      return;
    }
    const budget = parseFloat(budgetUsd);
    if (isNaN(budget) || budget < 1) {
      setError('Budget must be at least $1.00 USDC');
      return;
    }

    setLoading(true);
    try {
      const auth = await getAuth();
      const validUrls = referenceUrls.filter(u => u.trim().length > 0);
      const validImages = referenceImages.filter(img => img.url && !img.uploading).map(img => img.url);

      const res = await fetch('/api/bounties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          brief,
          category,
          budget_usd: budget.toFixed(2),
          deadline_hours: deadlineHours,
          claim_window_hours: claimWindowHours,
          reference_urls: validUrls.length > 0 ? validUrls : undefined,
          reference_images: validImages.length > 0 ? validImages : undefined,
          client_wallet: auth.wallet,
          wallet_sig: auth.wallet_sig,
          wallet_sig_ts: auth.wallet_sig_ts,
        }),
      });

      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'Failed to create bounty');
        return;
      }

      onCreated();
      onClose();
    } catch {
      setError('Failed to create bounty');
    } finally {
      setLoading(false);
    }
  }, [walletAddress, title, brief, category, budgetUsd, deadlineHours, claimWindowHours, referenceUrls, referenceImages, getAuth, login, onCreated, onClose]);

  if (!open) return null;

  const isUploading = referenceImages.some(img => img.uploading);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 rounded-t-2xl">
          <h2 className="text-lg font-bold text-black dark:text-white font-display">Post a Bounty</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-black dark:hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <label className="block text-xs text-gray-500 dark:text-neutral-500 font-mono mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Generate a 5s video of a cat surfing"
              maxLength={100}
              className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-black border border-gray-200 dark:border-neutral-800 text-black dark:text-white text-sm font-mono placeholder:text-gray-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-atelier"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 dark:text-neutral-500 font-mono mb-1.5">Brief</label>
            <textarea
              value={brief}
              onChange={e => setBrief(e.target.value)}
              placeholder="Describe exactly what you need, including style, format, and any specific requirements..."
              maxLength={2000}
              rows={4}
              className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-black border border-gray-200 dark:border-neutral-800 text-black dark:text-white text-sm font-mono placeholder:text-gray-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-atelier resize-none"
            />
            <p className="text-[10px] text-gray-400 dark:text-neutral-600 font-mono mt-1 text-right">{brief.length}/2000</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 dark:text-neutral-500 font-mono mb-1.5">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as ServiceCategory)}
                className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-black border border-gray-200 dark:border-neutral-800 text-black dark:text-white text-sm font-mono focus:outline-none focus:border-atelier"
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 dark:text-neutral-500 font-mono mb-1.5">Budget (USDC)</label>
              <input
                type="number"
                value={budgetUsd}
                onChange={e => setBudgetUsd(e.target.value)}
                placeholder="5.00"
                min="1"
                step="0.01"
                className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-black border border-gray-200 dark:border-neutral-800 text-black dark:text-white text-sm font-mono placeholder:text-gray-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-atelier"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 dark:text-neutral-500 font-mono mb-1.5">Delivery Deadline</label>
              <select
                value={deadlineHours}
                onChange={e => setDeadlineHours(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-black border border-gray-200 dark:border-neutral-800 text-black dark:text-white text-sm font-mono focus:outline-none focus:border-atelier"
              >
                {DEADLINE_OPTIONS.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 dark:text-neutral-500 font-mono mb-1.5">Claim Window</label>
              <select
                value={claimWindowHours}
                onChange={e => setClaimWindowHours(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-black border border-gray-200 dark:border-neutral-800 text-black dark:text-white text-sm font-mono focus:outline-none focus:border-atelier"
              >
                {CLAIM_WINDOW_OPTIONS.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 dark:text-neutral-500 font-mono mb-1.5">Reference URLs (optional)</label>
            {referenceUrls.map((url, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input
                  type="url"
                  value={url}
                  onChange={e => {
                    const updated = [...referenceUrls];
                    updated[i] = e.target.value;
                    setReferenceUrls(updated);
                  }}
                  placeholder="https://..."
                  className="flex-1 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-black border border-gray-200 dark:border-neutral-800 text-black dark:text-white text-xs font-mono placeholder:text-gray-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-atelier"
                />
                {referenceUrls.length > 1 && (
                  <button
                    onClick={() => setReferenceUrls(referenceUrls.filter((_, j) => j !== i))}
                    className="text-gray-400 hover:text-red-500 transition-colors text-xs"
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
            {referenceUrls.length < 5 && (
              <button
                onClick={() => setReferenceUrls([...referenceUrls, ''])}
                className="text-xs text-atelier font-mono hover:underline"
              >
                + Add URL
              </button>
            )}
          </div>

          <div>
            <label className="block text-xs text-gray-500 dark:text-neutral-500 font-mono mb-1.5">Reference Images (optional)</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {referenceImages.map((img, i) => (
                <div key={i} className="relative w-16 h-16 rounded-lg border border-gray-200 dark:border-neutral-800 overflow-hidden">
                  {img.uploading ? (
                    <div className="flex items-center justify-center h-full bg-gray-50 dark:bg-black">
                      <div className="w-4 h-4 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <>
                      <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                      <button
                        onClick={() => setReferenceImages(prev => prev.filter((_, j) => j !== i))}
                        className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center hover:bg-red-500"
                      >
                        &times;
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            {referenceImages.length < MAX_REFERENCE_IMAGES && (
              <>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={handleFileSelect} className="hidden" />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-atelier font-mono hover:underline"
                >
                  + Upload Image
                </button>
              </>
            )}
          </div>

          {budgetUsd && parseFloat(budgetUsd) >= 1 && (
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-black border border-gray-200 dark:border-neutral-800">
              <div className="flex justify-between text-xs font-mono text-gray-600 dark:text-neutral-400">
                <span>Budget</span>
                <span>${parseFloat(budgetUsd).toFixed(2)} USDC</span>
              </div>
              <div className="flex justify-between text-xs font-mono text-gray-500 dark:text-neutral-500 mt-1">
                <span>Platform fee (10%)</span>
                <span>${(parseFloat(budgetUsd) * 0.10).toFixed(2)} USDC</span>
              </div>
              <div className="flex justify-between text-xs font-mono text-black dark:text-white font-semibold mt-2 pt-2 border-t border-gray-200 dark:border-neutral-800">
                <span>You pay at acceptance</span>
                <span>${(parseFloat(budgetUsd) * 1.10).toFixed(2)} USDC</span>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50">
              <p className="text-xs text-red-600 dark:text-red-400 font-mono">{error}</p>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 px-6 py-4 border-t border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 rounded-b-2xl">
          <button
            onClick={handleSubmit}
            disabled={loading || isUploading || !title || brief.length < 10 || !budgetUsd}
            className="w-full py-3 rounded-xl text-sm font-semibold font-mono transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-atelier text-white hover:bg-atelier/90"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Creating...
              </span>
            ) : !authenticated ? (
              'Sign In'
            ) : (
              'Post Bounty'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
