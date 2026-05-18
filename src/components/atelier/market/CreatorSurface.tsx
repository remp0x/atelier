'use client';

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { SKILL_CATEGORIES } from './marketData';

const MAX_MD_BYTES = 256 * 1024; // 256 KB — server enforces same limit
const MAX_NAME = 60;
const MAX_DESCRIPTION = 200;

interface PublishedSkill {
  slug: string;
  url: string;
}

const INPUT_CLS =
  'w-full rounded-md border border-gray-200 dark:border-neutral-700 bg-white dark:bg-black/50 px-3 py-2 font-mono text-[13px] text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 outline-none focus:border-atelier/60 focus:ring-1 focus:ring-atelier/30 transition-colors';

function shortWallet(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

export function CreatorSurface(): JSX.Element {
  const auth = useAtelierAuth();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryIdx, setCategoryIdx] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [pricing, setPricing] = useState<'free' | 'paid'>('paid');
  const [usdcAmount, setUsdcAmount] = useState('5');
  const [submitting, setSubmitting] = useState(false);
  const [published, setPublished] = useState<PublishedSkill | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingAuthSubmit, setPendingAuthSubmit] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const category = SKILL_CATEGORIES[categoryIdx];
  const parsedUsdc = Number(usdcAmount);

  function handleFile(f: File | null): void {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.md')) {
      setError('Only .md files are accepted.');
      return;
    }
    if (f.size > MAX_MD_BYTES) {
      setError(`File too large. Max ${formatBytes(MAX_MD_BYTES)}.`);
      return;
    }
    setFile(f);
    setError(null);
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>): void {
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files?.[0] ?? null);
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>): void {
    handleFile(e.target.files?.[0] ?? null);
    e.target.value = '';
  }

  function validate(): string | null {
    if (!name.trim()) return 'Skill name is required.';
    if (!description.trim()) return 'Description is required.';
    if (!file) return 'A .md file is required.';
    if (pricing === 'paid') {
      if (!Number.isFinite(parsedUsdc) || parsedUsdc <= 0) {
        return 'Set a USDC price greater than zero, or choose Free.';
      }
    }
    return null;
  }

  async function publish(): Promise<void> {
    if (!file) {
      setError('A .md file is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const sig = await auth.getAuth();
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', name.trim());
      fd.append('description', description.trim());
      fd.append('category', category.slug);
      fd.append('pricing', pricing);
      fd.append('price_usdc', pricing === 'paid' ? String(parsedUsdc) : '0');
      fd.append('wallet', sig.wallet);
      fd.append('wallet_sig', sig.wallet_sig);
      fd.append('wallet_sig_ts', String(sig.wallet_sig_ts));

      const res = await fetch('/api/skills/submit', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || 'Submission failed. Try again in a moment.');
        return;
      }
      setPublished({ slug: json.data.slug, url: json.data.url });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed. Try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(): void {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);

    if (!auth.walletReady) {
      setPendingAuthSubmit(true);
      auth.login();
      return;
    }

    void publish();
  }

  useEffect(() => {
    if (!pendingAuthSubmit || !auth.walletReady) return;
    setPendingAuthSubmit(false);
    void publish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAuthSubmit, auth.walletReady]);

  function resetForm(): void {
    setName('');
    setDescription('');
    setCategoryIdx(0);
    setFile(null);
    setPricing('free');
    setUsdcAmount('5');
    setError(null);
    setPublished(null);
    setPendingAuthSubmit(false);
  }

  return (
    <section
      id="become-a-creator"
      className="relative overflow-hidden border-t border-gray-200 dark:border-neutral-900 py-14 md:py-20"
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -inset-[10%]"
          style={{
            filter: 'blur(12px)',
            background: `
              radial-gradient(ellipse 70% 60% at 50% 100%, rgba(250,76,20,0.18), transparent 62%),
              radial-gradient(ellipse 50% 40% at 15% 90%, rgba(201,58,10,0.12), transparent 58%),
              radial-gradient(ellipse 50% 40% at 85% 85%, rgba(255,122,61,0.10), transparent 58%)
            `,
          }}
        />
      </div>

      <div className="relative max-w-[1180px] mx-auto px-6">
        {published ? (
          <SubmittedState onPublishAnother={resetForm} skillUrl={published.url} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] gap-10 lg:gap-14 items-start">
            {/* INFO */}
            <div className="lg:sticky lg:top-24">
              <p className="font-mono text-[11px] font-semibold tracking-[0.18em] text-atelier mb-3">
                FOR CREATORS
              </p>
              <h2
                className="font-display font-extrabold tracking-[-0.03em] leading-[1.05] mb-4"
                style={{ fontSize: 'clamp(1.625rem, 3.2vw, 2.375rem)' }}
              >
                Got a workflow that ships?{' '}
                <span className="text-gradient-atelier">Publish it.</span>
              </h2>
              <p className="text-[14.5px] md:text-[15.5px] leading-[1.55] text-gray-700 dark:text-neutral-300 mb-6">
                Upload a Markdown file, pick a category, set a price or make it free.
                Your wallet is your identity.
              </p>
              <ul className="space-y-3 text-[13.5px] leading-[1.55] text-gray-700 dark:text-neutral-300">
                <InfoItem>
                  <span className="text-black dark:text-white font-semibold">Goes live instantly.</span>{' '}
                  No waitlist, no review queue.
                </InfoItem>
                <InfoItem>
                  <span className="text-black dark:text-white font-semibold">Earn in USDC.</span>{' '}
                  Per download, settled on Solana. Platform takes 15%.
                </InfoItem>
                <InfoItem>
                  <span className="text-black dark:text-white font-semibold">Non-exclusive.</span>{' '}
                  List it anywhere else too. No lockup.
                </InfoItem>
              </ul>
            </div>

            {/* FORM */}
            <div className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white/70 dark:bg-black-soft/70 backdrop-blur-sm p-5">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200 dark:border-neutral-800">
                <div className="font-mono text-[10px] tracking-[0.18em] text-atelier">
                  PUBLISH A SKILL
                </div>
                <IdentityChip
                  walletAddress={auth.walletAddress}
                  walletReady={auth.walletReady}
                  onDisconnect={auth.logout}
                />
              </div>

              <Field label="Skill name" hint={`${name.length}/${MAX_NAME}`}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, MAX_NAME))}
                  placeholder="e.g. Outbound Copywriter"
                  className={INPUT_CLS}
                />
              </Field>

              <Field label="Description" hint={`${description.length}/${MAX_DESCRIPTION}`}>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION))}
                  placeholder="One sentence. What does it do?"
                  className={`${INPUT_CLS} font-sans text-[13.5px] leading-[1.5] resize-none`}
                />
              </Field>

              <Field label="Category">
                <div className="flex flex-wrap gap-1.5">
                  {SKILL_CATEGORIES.map((c, i) => (
                    <button
                      key={c.slug}
                      type="button"
                      onClick={() => setCategoryIdx(i)}
                      className={`h-7 px-2.5 inline-flex items-center rounded-md font-mono text-[10.5px] tracking-wide border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/50 ${
                        i === categoryIdx
                          ? 'border-atelier/60 bg-atelier/[0.10] text-atelier'
                          : 'border-gray-200 dark:border-neutral-700 text-gray-700 dark:text-neutral-300 hover:border-atelier/40 hover:text-atelier'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Skill file" hint=".md, max 1 MB">
                <label
                  htmlFor="skill-md-file"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`flex items-center gap-2.5 cursor-pointer rounded-md border border-dashed px-3 h-11 transition-colors ${
                    isDragging
                      ? 'border-atelier/60 bg-atelier/[0.08]'
                      : file
                        ? 'border-atelier/50 bg-atelier/[0.05]'
                        : 'border-gray-300 dark:border-neutral-700 hover:border-atelier/40 bg-white/60 dark:bg-black/30'
                  }`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={`w-4 h-4 shrink-0 ${file ? 'text-atelier' : 'text-gray-500 dark:text-neutral-400'}`}>
                    {file ? (
                      <>
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6M9 13h6M9 17h6M9 9h2" />
                      </>
                    ) : (
                      <>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <path d="M17 8l-5-5-5 5M12 3v12" />
                      </>
                    )}
                  </svg>
                  <div className="flex-1 min-w-0 flex items-baseline gap-2">
                    {file ? (
                      <>
                        <span className="font-mono text-[12px] text-atelier truncate">
                          {file.name}
                        </span>
                        <span className="font-mono text-[10px] text-gray-500 dark:text-neutral-400 shrink-0">
                          {formatBytes(file.size)}
                        </span>
                      </>
                    ) : (
                      <span className="font-mono text-[12px] text-gray-700 dark:text-neutral-200 truncate">
                        Drop a .md file, or click to browse
                      </span>
                    )}
                  </div>
                  {file && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setFile(null);
                      }}
                      className="font-mono text-[10px] text-gray-500 dark:text-neutral-400 hover:text-atelier shrink-0"
                      aria-label="Remove file"
                    >
                      remove
                    </button>
                  )}
                  <input
                    id="skill-md-file"
                    ref={fileInputRef}
                    type="file"
                    accept=".md,text/markdown"
                    onChange={handleInputChange}
                    className="sr-only"
                  />
                </label>
              </Field>

              <Field label="Price">
                <div className="flex items-center gap-2">
                  <div className="inline-flex h-9 rounded-md border border-gray-200 dark:border-neutral-700 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setPricing('free')}
                      className={`px-3 h-full font-mono text-[11px] tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/50 ${
                        pricing === 'free'
                          ? 'bg-atelier/[0.12] text-atelier'
                          : 'text-gray-600 dark:text-neutral-400 hover:text-atelier'
                      }`}
                    >
                      FREE
                    </button>
                    <div className="w-px bg-gray-200 dark:bg-neutral-700" />
                    <button
                      type="button"
                      onClick={() => setPricing('paid')}
                      className={`px-3 h-full font-mono text-[11px] tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/50 ${
                        pricing === 'paid'
                          ? 'bg-atelier/[0.12] text-atelier'
                          : 'text-gray-600 dark:text-neutral-400 hover:text-atelier'
                      }`}
                    >
                      USDC
                    </button>
                  </div>
                  {pricing === 'paid' && (
                    <div className="flex items-center gap-1.5 h-9 rounded-md border border-gray-200 dark:border-neutral-700 bg-white dark:bg-black/50 px-2.5 focus-within:border-atelier/60 transition-colors">
                      <span className="font-mono text-[11px] text-gray-500 dark:text-neutral-400">$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0.01"
                        value={usdcAmount}
                        onChange={(e) => setUsdcAmount(e.target.value)}
                        className="w-14 bg-transparent outline-none font-mono text-[13px] text-black dark:text-white"
                        aria-label="USDC price per install"
                      />
                      <span className="font-mono text-[10px] text-gray-500 dark:text-neutral-400 whitespace-nowrap">USDC / install</span>
                    </div>
                  )}
                </div>
              </Field>

              {error && (
                <div
                  role="alert"
                  className="-mt-1 mb-3 px-3 py-2 rounded-md border border-red-500/50 bg-red-500/[0.08] font-mono text-[11px] text-red-600 dark:text-red-300"
                >
                  {error}
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || pendingAuthSubmit}
                  className={`w-full inline-flex items-center justify-center gap-2 px-5 h-11 rounded font-mono text-[13px] font-medium tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black-soft ${
                    submitting || pendingAuthSubmit
                      ? 'bg-atelier/60 text-white/80 cursor-wait'
                      : 'bg-atelier text-white hover:bg-atelier-bright hover:shadow-[0_0_20px_rgba(250,76,20,0.4)]'
                  }`}
                >
                  {submitting
                    ? 'Submitting…'
                    : pendingAuthSubmit
                      ? 'Waiting for sign-in…'
                      : auth.walletReady
                        ? 'Publish skill →'
                        : 'Sign in & publish →'}
                </button>
                <p className="mt-2.5 font-mono text-[10.5px] leading-[1.5] text-gray-500 dark:text-neutral-400">
                  {auth.walletReady
                    ? 'Goes live instantly. Your wallet is credited as creator. Only .md files accepted.'
                    : 'Fill the form, then sign in at submit to claim it with your wallet.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="mb-3.5 last:mb-0">
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="font-mono text-[10px] tracking-[0.14em] text-gray-600 dark:text-neutral-400 uppercase">
          {label}
        </div>
        {hint && (
          <div className="font-mono text-[9.5px] tracking-wide text-gray-500 dark:text-neutral-500">
            {hint}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function InfoItem({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <li className="flex items-start gap-2.5">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className="w-4 h-4 mt-0.5 text-atelier shrink-0"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
      <span>{children}</span>
    </li>
  );
}

function IdentityChip({
  walletAddress,
  walletReady,
  onDisconnect,
}: {
  walletAddress: string | null;
  walletReady: boolean;
  onDisconnect: () => void;
}): JSX.Element {
  if (!walletReady) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono text-[10px] tracking-[0.12em] text-gray-600 dark:text-neutral-300 border border-gray-300 dark:border-neutral-600 bg-gray-100 dark:bg-neutral-900/80">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-500 dark:bg-neutral-400" />
        ANON
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono text-[10px] tracking-[0.12em] text-atelier border border-atelier/50 bg-atelier/[0.10]">
        <span className="w-1.5 h-1.5 rounded-full bg-atelier" />
        {walletAddress ? shortWallet(walletAddress) : 'CONNECTED'}
      </span>
      <button
        type="button"
        onClick={onDisconnect}
        className="font-mono text-[10px] text-gray-500 dark:text-neutral-400 hover:text-atelier transition-colors"
      >
        disconnect
      </button>
    </div>
  );
}

function SubmittedState({
  onPublishAnother,
  skillUrl,
}: {
  onPublishAnother: () => void;
  skillUrl: string;
}): JSX.Element {
  return (
    <div className="max-w-[560px] mx-auto rounded-xl border border-atelier/40 bg-atelier/[0.04] backdrop-blur-md p-6 md:p-8 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-atelier/[0.10] border border-atelier/40 mb-5">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-atelier">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <h3 className="font-display font-bold text-xl md:text-2xl tracking-[-0.02em] mb-2">
        Live on the marketplace
      </h3>
      <p className="text-[14.5px] leading-[1.55] text-gray-600 dark:text-neutral-400 max-w-[420px] mx-auto mb-6">
        Your skill is now visible at <span className="font-mono text-atelier">{skillUrl}</span>.
        Your wallet is credited as creator.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <a
          href={skillUrl}
          className="inline-flex items-center gap-1.5 px-5 py-3.5 rounded bg-atelier text-white font-mono text-[13px] font-medium tracking-wide transition-all hover:bg-atelier-bright hover:shadow-[0_0_20px_rgba(250,76,20,0.4)]"
        >
          View skill →
        </a>
        <button
          type="button"
          onClick={onPublishAnother}
          className="inline-flex items-center gap-1.5 px-5 py-3.5 rounded border border-atelier/60 text-atelier font-mono text-[13px] font-medium tracking-wide transition-colors hover:bg-atelier hover:text-white"
        >
          Publish another
        </button>
      </div>
    </div>
  );
}

