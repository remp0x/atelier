'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { atelierHref } from '@/lib/atelier-paths';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { sendUsdcPayment } from '@/lib/solana-pay';
import { useWalletAuth } from '@/hooks/use-wallet-auth';
import type { Service } from '@/lib/atelier-db';

type Step = 'brief' | 'review' | 'confirmation';

interface HireModalProps {
  service: Service;
  open: boolean;
  onClose: () => void;
}

interface ReferenceImage {
  url: string;
  name: string;
  uploading: boolean;
}

const PLATFORM_FEE_RATE = 0.10;
const MAX_REFERENCE_IMAGES = 3;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png'];

const QUICK_PROMPTS: Record<string, string[]> = {
  image_gen: [
    'A portrait in cinematic lighting with dramatic shadows',
    'Product hero shot on a clean minimal background',
    'Abstract art with bold colors and geometric shapes',
  ],
  video_gen: [
    'A slow-motion reveal of a product rotating 360 degrees',
    'Cinematic b-roll footage with smooth camera movement',
    'A dynamic logo animation with particle effects',
  ],
  ugc: [
    'Lifestyle product-in-hand shot for Instagram Stories',
    'Unboxing moment with warm natural lighting',
    'Before-and-after transformation content',
  ],
  brand_content: [
    'Modern logo concept with geometric elements',
    'Social media template set in brand colors',
    'Brand identity mockup on business cards and packaging',
  ],
};

const BRIEF_HINTS: Record<string, { workspace: string; single: string; helper: string }> = {
  agent_atelier_animestudio: {
    workspace: 'e.g. "Anime girl with long silver hair, blue eyes, school uniform. Soft pastel colors, slice-of-life vibe. All images should feature the same character."',
    single: 'e.g. "A cyberpunk cityscape at night with neon signs in Japanese, rain reflections on the street, anime style"',
    helper: 'Describe the style, characters, and mood for your project. Each generation will follow this direction.',
  },
  agent_atelier_lenscraft: {
    workspace: 'e.g. "Premium skincare line — minimalist white packaging, clean marble backgrounds, soft diffused lighting. Hero shots and flat-lays with botanical accents."',
    single: 'e.g. "Wireless headphones on a dark concrete surface, dramatic rim lighting, sleek and modern feel"',
    helper: 'Describe your product and the visual style you need. All renders will maintain consistent lighting and brand feel.',
  },
  agent_atelier_ugcfactory: {
    workspace: 'e.g. "Organic protein bar brand — earthy tones, kitchen and gym settings, product-in-hand shots. Target audience: health-conscious millennials on Instagram."',
    single: 'e.g. "Coffee mug on a messy desk next to a laptop, morning light through window, cozy work-from-home vibe"',
    helper: 'Describe your brand, product, and target audience. Each piece of content will follow this creative direction.',
  },
};

const DEFAULT_HINTS = {
  workspace: 'Describe your project — style, mood, and what you want to achieve...',
  single: 'Describe what you need...',
  helper: 'Describe the style and direction for your project. Each generation will follow this direction.',
};

export function HireModal({ service, open, onClose }: HireModalProps) {
  const router = useRouter();
  const wallet = useWallet();
  const { getAuth } = useWalletAuth();
  const { connection } = useConnection();
  const { setVisible: openWalletModal } = useWalletModal();

  const [step, setStep] = useState<Step>('brief');
  const [brief, setBrief] = useState('');
  const [referenceUrls, setReferenceUrls] = useState<string[]>(['']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStep('brief');
      setBrief('');
      setReferenceUrls(['']);
      setReferenceImages([]);
      setError(null);
      setLoading(false);
      setOrderId(null);
    }
  }, [open]);

  useEffect(() => {
    if (step === 'confirmation' && orderId) {
      const timer = setTimeout(() => {
        router.push(atelierHref(`/atelier/orders/${orderId}`));
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [step, orderId, router]);

  const isSubscription = service.price_type === 'weekly' || service.price_type === 'monthly';
  const isWorkspace = (service.quota_limit ?? 0) > 0 || isSubscription;
  const price = parseFloat(service.price_usd);
  const fee = price * PLATFORM_FEE_RATE;
  const total = price;

  const hints = BRIEF_HINTS[service.agent_id] ?? DEFAULT_HINTS;
  const validUrls = referenceUrls.filter((u) => u.trim().length > 0);

  const isUploading = referenceImages.some((img) => img.uploading);

  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    e.target.value = '';
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError('Only JPEG and PNG images are allowed');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError('Image must be under 5MB');
      return;
    }
    if (referenceImages.length >= MAX_REFERENCE_IMAGES) {
      setError(`Maximum ${MAX_REFERENCE_IMAGES} images allowed`);
      return;
    }

    setError(null);
    const placeholder: ReferenceImage = { url: '', name: file.name, uploading: true };
    setReferenceImages((prev) => [...prev, placeholder]);
    const idx = referenceImages.length;

    try {
      const auth = await getAuth();
      const params = new URLSearchParams({
        wallet: auth.wallet,
        wallet_sig: auth.wallet_sig,
        wallet_sig_ts: String(auth.wallet_sig_ts),
      });
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/orders/brief-images?${params}`, {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();

      if (!json.success) {
        setReferenceImages((prev) => prev.filter((_, i) => i !== idx));
        setError(json.error || 'Upload failed');
        return;
      }

      setReferenceImages((prev) =>
        prev.map((img, i) => (i === idx ? { url: json.data.url, name: file.name, uploading: false } : img)),
      );
    } catch (err) {
      setReferenceImages((prev) => prev.filter((_, i) => i !== idx));
      setError(err instanceof Error ? err.message : 'Image upload failed');
    }
  }, [referenceImages.length, getAuth]);

  const removeImage = useCallback((idx: number) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handlePay = useCallback(async () => {
    if (!wallet.publicKey) {
      openWalletModal(true);
      return;
    }

    const treasuryWallet = process.env.NEXT_PUBLIC_ATELIER_TREASURY_WALLET;
    if (!treasuryWallet) {
      setError('Treasury wallet not configured');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setLoadingMsg('Signing wallet...');
      const auth = await getAuth();

      setLoadingMsg('Creating order...');
      const createRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...auth,
          service_id: service.id,
          brief,
          reference_urls: validUrls.length > 0 ? validUrls : undefined,
          reference_images: referenceImages.length > 0 ? referenceImages.map((img) => img.url) : undefined,
          client_wallet: wallet.publicKey.toBase58(),
        }),
      });
      const createJson = await createRes.json();
      if (!createJson.success) throw new Error(createJson.error);

      const newOrderId = createJson.data.id;

      setLoadingMsg('Sending payment...');
      const txSig = await sendUsdcPayment(
        connection,
        wallet,
        new PublicKey(treasuryWallet),
        total,
      );

      setLoadingMsg(isWorkspace ? 'Activating workspace...' : 'Verifying payment...');
      const patchRes = await fetch(`/api/orders/${newOrderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...auth,
          action: 'pay',
          payment_method: 'usdc-sol',
          escrow_tx_hash: txSig,
        }),
      });
      const patchJson = await patchRes.json();
      if (!patchJson.success) throw new Error(patchJson.error);

      setOrderId(newOrderId);
      setStep('confirmation');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setLoading(false);
    }
  }, [wallet, connection, service, brief, validUrls, referenceImages, total, openWalletModal, getAuth, isWorkspace]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg mx-4 bg-white dark:bg-black-soft border border-gray-200 dark:border-neutral-800 rounded-lg shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-neutral-800">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold font-display text-black dark:text-white">
              {step === 'confirmation' ? 'Order Placed' : `Hire — ${service.title}`}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 dark:text-neutral-500 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {step !== 'confirmation' && (
            <div className="flex items-center gap-2 mt-2">
              {service.agent_avatar_url ? (
                <img src={service.agent_avatar_url} alt={service.agent_name} className="w-5 h-5 rounded object-cover" />
              ) : (
                <div className="w-5 h-5 rounded bg-atelier/15 flex items-center justify-center text-atelier text-2xs font-bold font-mono">
                  {service.agent_name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-xs font-mono text-gray-500 dark:text-neutral-500">{service.agent_name}</span>
              {service.avg_rating != null && (
                <span className="flex items-center gap-0.5 text-xs font-mono text-gray-400 dark:text-neutral-500">
                  <svg className="w-3 h-3 text-atelier" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  {service.avg_rating.toFixed(1)}
                </span>
              )}
              <span className="ml-auto text-xs font-mono text-atelier font-semibold">
                ${price.toFixed(2)}{service.price_type === 'weekly' ? '/wk' : service.price_type === 'monthly' ? '/mo' : ''} USDC
              </span>
            </div>
          )}
        </div>

        {/* Steps indicator */}
        {step !== 'confirmation' && (
          <div className="flex items-center gap-2 px-6 pt-4">
            {(['brief', 'review'] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold ${
                  step === s
                    ? 'bg-atelier text-white'
                    : s === 'brief' && step === 'review'
                      ? 'bg-emerald-400/20 text-emerald-400'
                      : 'bg-gray-200 dark:bg-neutral-800 text-gray-400 dark:text-neutral-500'
                }`}>
                  {s === 'brief' && step === 'review' ? '✓' : i + 1}
                </div>
                {i === 0 && (
                  <div className={`w-12 h-px ${step === 'review' ? 'bg-emerald-400/40' : 'bg-gray-200 dark:bg-neutral-800'}`} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="px-6 py-5">
          {step === 'brief' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-mono text-gray-600 dark:text-neutral-400 mb-1">
                  {isWorkspace ? 'Project Brief' : 'Brief'}
                </label>
                {isWorkspace && (
                  <p className="text-2xs text-gray-400 dark:text-neutral-500 mb-2">
                    {hints.helper}
                  </p>
                )}
                <textarea
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder={isWorkspace ? hints.workspace : hints.single}
                  rows={4}
                  maxLength={1000}
                  className="w-full px-3 py-2.5 rounded bg-gray-50 dark:bg-black border border-gray-200 dark:border-neutral-800 text-black dark:text-white text-sm font-mono placeholder:text-gray-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-atelier resize-none"
                />
                <span className="text-2xs font-mono text-gray-400 dark:text-neutral-600">
                  {brief.length}/1000
                </span>

                {/* Quick prompt templates */}
                {brief.length === 0 && (QUICK_PROMPTS[service.category] || QUICK_PROMPTS.image_gen)!.length > 0 && (
                  <div className="mt-2">
                    <p className="text-2xs font-mono text-gray-400 dark:text-neutral-600 mb-1.5">Try a prompt:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(QUICK_PROMPTS[service.category] || QUICK_PROMPTS.image_gen)!.map((prompt, i) => (
                        <button
                          key={i}
                          onClick={() => setBrief(prompt)}
                          className="px-2.5 py-1 rounded-full bg-gray-100 dark:bg-neutral-800/60 border border-gray-200 dark:border-neutral-800 text-2xs font-mono text-gray-500 dark:text-neutral-400 hover:border-atelier/40 hover:text-atelier transition-colors cursor-pointer truncate max-w-[200px]"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-mono text-gray-600 dark:text-neutral-400 mb-1.5">
                  Reference URLs <span className="text-gray-400 dark:text-neutral-600">(optional, max 5)</span>
                </label>
                {referenceUrls.map((url, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input
                      value={url}
                      onChange={(e) => {
                        const next = [...referenceUrls];
                        next[i] = e.target.value;
                        setReferenceUrls(next);
                      }}
                      placeholder="https://..."
                      className="flex-1 px-3 py-2 rounded-lg bg-gray-50 dark:bg-black border border-gray-200 dark:border-neutral-800 text-black dark:text-white text-sm font-mono placeholder:text-gray-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-atelier"
                    />
                    {referenceUrls.length > 1 && (
                      <button
                        onClick={() => setReferenceUrls(referenceUrls.filter((_, j) => j !== i))}
                        className="text-gray-400 dark:text-neutral-600 hover:text-red-400 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
                {referenceUrls.length < 5 && (
                  <button
                    onClick={() => setReferenceUrls([...referenceUrls, ''])}
                    className="text-xs font-mono text-atelier hover:text-atelier-bright transition-colors"
                  >
                    + Add URL
                  </button>
                )}
              </div>

              <div>
                <label className="block text-sm font-mono text-gray-600 dark:text-neutral-400 mb-1.5">
                  Reference Images <span className="text-gray-400 dark:text-neutral-600">(optional, max 3, JPG/PNG, 5MB each)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {referenceImages.map((img, i) => (
                    <div key={i} className="relative w-20 h-20 rounded border border-gray-200 dark:border-neutral-800 overflow-hidden bg-gray-100 dark:bg-black">
                      {img.uploading ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-5 h-5 border-2 border-atelier/40 border-t-atelier rounded-full animate-spin" />
                        </div>
                      ) : (
                        <>
                          <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                          <button
                            onClick={() => removeImage(i)}
                            className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-red-500 transition-colors"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                  {referenceImages.length < MAX_REFERENCE_IMAGES && (
                    <label className="w-20 h-20 rounded border border-dashed border-gray-300 dark:border-neutral-700 flex flex-col items-center justify-center cursor-pointer hover:border-atelier/60 transition-colors">
                      <svg className="w-5 h-5 text-gray-400 dark:text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      <span className="text-2xs font-mono text-gray-400 dark:text-neutral-600 mt-0.5">Add</span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png"
                        onChange={handleImageSelect}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-400 font-mono">{error}</p>
              )}

              <button
                onClick={() => setStep('review')}
                disabled={brief.length < 10 || isUploading}
                className="w-full py-2.5 rounded border border-atelier text-atelier text-sm font-medium font-mono tracking-wide disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:bg-atelier hover:text-white"
              >
                Continue
              </button>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-gray-50 dark:bg-black border border-gray-200 dark:border-neutral-800 space-y-3">
                <div className="flex justify-between text-sm font-mono">
                  <span className="text-gray-500 dark:text-neutral-400">Service</span>
                  <span className="text-black dark:text-white font-medium">{service.title}</span>
                </div>
                <div className="flex justify-between text-sm font-mono">
                  <span className="text-gray-500 dark:text-neutral-400">Price</span>
                  <span className="text-black dark:text-white">
                    ${price.toFixed(2)}{service.price_type === 'weekly' ? '/week' : service.price_type === 'monthly' ? '/month' : ''}
                  </span>
                </div>
                {isSubscription && (
                  <div className="flex justify-between text-sm font-mono">
                    <span className="text-gray-500 dark:text-neutral-400">Period</span>
                    <span className="text-black dark:text-white">{service.price_type === 'weekly' ? '7 days' : '30 days'}</span>
                  </div>
                )}
                {isSubscription && (
                  <div className="flex justify-between text-sm font-mono">
                    <span className="text-gray-500 dark:text-neutral-400">Generations</span>
                    <span className="text-black dark:text-white">{(service.quota_limit ?? 0) > 0 ? service.quota_limit : 'Unlimited'}</span>
                  </div>
                )}
                <div className="border-t border-gray-200 dark:border-neutral-800 pt-3 flex justify-between text-sm font-mono font-bold">
                  <span className="text-black dark:text-white">Total</span>
                  <span className="text-atelier">${total.toFixed(2)} USDC</span>
                </div>
                <p className="text-2xs font-mono text-gray-400 dark:text-neutral-600 mt-1">
                  10% platform fee deducted from provider payout
                </p>
              </div>

              <div className="p-3 rounded-lg bg-gray-50 dark:bg-black border border-gray-200 dark:border-neutral-800">
                <p className="text-xs font-mono text-gray-500 dark:text-neutral-400 mb-1">Your brief:</p>
                <p className="text-sm text-black dark:text-white">{brief}</p>
                {referenceImages.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-200 dark:border-neutral-800">
                    <p className="text-xs font-mono text-gray-500 dark:text-neutral-400 mb-1.5">Reference images:</p>
                    <div className="flex gap-2">
                      {referenceImages.map((img, i) => (
                        <img
                          key={i}
                          src={img.url}
                          alt={img.name}
                          className="w-16 h-16 rounded border border-gray-200 dark:border-neutral-800 object-cover"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <p className="text-sm text-red-400 font-mono">{error}</p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('brief')}
                  className="px-4 py-2.5 rounded border border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-400 text-sm font-mono hover:text-atelier hover:border-atelier/40 transition-colors duration-200"
                >
                  Back
                </button>
                <button
                  onClick={handlePay}
                  disabled={loading}
                  className="flex-1 py-2.5 rounded border border-atelier text-atelier text-sm font-medium font-mono tracking-wide disabled:opacity-60 transition-all duration-200 hover:bg-atelier hover:text-white flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-atelier/40 border-t-atelier rounded-full animate-spin" />
                      {loadingMsg}
                    </>
                  ) : !wallet.publicKey ? (
                    'Connect Wallet'
                  ) : (
                    `Pay $${total.toFixed(2)} USDC`
                  )}
                </button>
              </div>
            </div>
          )}

          {step === 'confirmation' && (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-emerald-400/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h3 className="text-lg font-bold font-display text-black dark:text-white mb-2">
                {isSubscription ? 'Subscription active!' : isWorkspace ? 'Workspace ready!' : 'Order placed!'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-neutral-400 font-mono mb-4">
                {isSubscription && service.price_type === 'weekly' ? 'Your 7-day subscription is active! Start generating. Redirecting...' :
                 isSubscription && service.price_type === 'monthly' ? 'Your 30-day subscription is active! Start generating. Redirecting...' :
                 isWorkspace ? 'Your workspace is ready! Start generating. Redirecting...' :
                 'Your order is being processed. Redirecting...'}
              </p>
              <a
                href={atelierHref(`/atelier/orders/${orderId}`)}
                className="text-sm font-mono text-atelier hover:text-atelier-bright transition-colors"
              >
                View Order →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
