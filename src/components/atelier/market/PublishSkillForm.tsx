'use client';

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { SKILL_CATEGORIES } from './marketData';

const MAX_MD_BYTES = 256 * 1024;
const MAX_NAME = 60;
const MAX_DESCRIPTION = 200;

const INPUT_CLS =
  'w-full rounded-md border border-gray-200 dark:border-neutral-700 bg-white dark:bg-black/50 px-3 py-2 font-mono text-[13px] text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 outline-none focus:border-atelier/60 focus:ring-1 focus:ring-atelier/30 transition-colors';

interface PublishedSkill {
  slug: string;
  url: string;
}

interface PublishSkillFormProps {
  onPublished?: (skill: PublishedSkill) => void;
  variant?: 'panel' | 'bare';
}

function shortWallet(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

export function PublishSkillForm({ onPublished, variant = 'panel' }: PublishSkillFormProps): JSX.Element {
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
      const skill = { slug: json.data.slug as string, url: json.data.url as string };
      setPublished(skill);
      onPublished?.(skill);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed. Try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(): void {
    if (!auth.walletReady) {
      auth.login();
      return;
    }
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    void publish();
  }

  function resetForm(): void {
    setName('');
    setDescription('');
    setCategoryIdx(0);
    setFile(null);
    setPricing('paid');
    setUsdcAmount('5');
    setError(null);
    setPublished(null);
  }

  const containerCls =
    variant === 'panel'
      ? 'rounded-xl border border-gray-200 dark:border-neutral-800 bg-white/70 dark:bg-black-soft/70 backdrop-blur-sm p-5'
      : '';

  if (published) {
    return (
      <div className={containerCls}>
        <PublishedState skill={published} onPublishAnother={resetForm} />
      </div>
    );
  }

  if (!auth.walletReady) {
    return (
      <div className={containerCls}>
        <SignInGate onSignIn={auth.login} />
      </div>
    );
  }

  return (
    <div className={containerCls}>
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200 dark:border-neutral-800">
        <div className="font-mono text-[10px] tracking-[0.18em] text-atelier">
          PUBLISH A SKILL
        </div>
        <IdentityChip
          walletAddress={auth.walletAddress}
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
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className={`w-4 h-4 shrink-0 ${file ? 'text-atelier' : 'text-gray-500 dark:text-neutral-400'}`}
          >
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
                <span className="font-mono text-[12px] text-atelier truncate">{file.name}</span>
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
                aria-label="USDC price"
              />
              <span className="font-mono text-[10px] text-gray-500 dark:text-neutral-400 whitespace-nowrap">USDC</span>
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
          disabled={submitting}
          className={`w-full inline-flex items-center justify-center gap-2 px-5 h-11 rounded font-mono text-[13px] font-medium tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black-soft ${
            submitting
              ? 'bg-atelier/60 text-white/80 cursor-wait'
              : 'bg-atelier text-white hover:bg-atelier-bright hover:shadow-[0_0_20px_rgba(250,76,20,0.4)]'
          }`}
        >
          {submitting ? 'Submitting…' : 'Publish skill →'}
        </button>
        <p className="mt-2.5 font-mono text-[10.5px] leading-[1.5] text-gray-500 dark:text-neutral-400">
          Goes live instantly. Your wallet is credited as creator. Only .md files accepted.
        </p>
      </div>
    </div>
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

function IdentityChip({
  walletAddress,
  onDisconnect,
}: {
  walletAddress: string | null;
  onDisconnect: () => void;
}): JSX.Element {
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

function SignInGate({ onSignIn }: { onSignIn: () => void }): JSX.Element {
  return (
    <div className="py-2">
      <div className="font-mono text-[10px] tracking-[0.18em] text-atelier mb-4">
        SIGN IN REQUIRED
      </div>
      <h3 className="font-display font-bold text-lg md:text-xl tracking-[-0.02em] mb-2 text-black dark:text-white">
        Connect your wallet to publish.
      </h3>
      <p className="text-[13.5px] leading-[1.55] text-gray-600 dark:text-neutral-400 mb-5">
        Your wallet is your creator identity. USDC payouts go straight there — no
        accounts, no email, no review queue.
      </p>
      <button
        type="button"
        onClick={onSignIn}
        className="w-full inline-flex items-center justify-center gap-2 px-5 h-11 rounded font-mono text-[13px] font-medium tracking-wide bg-atelier text-white hover:bg-atelier-bright hover:shadow-[0_0_20px_rgba(250,76,20,0.4)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black-soft"
      >
        Sign in to continue →
      </button>
      <p className="mt-2.5 font-mono text-[10.5px] leading-[1.5] text-gray-500 dark:text-neutral-400 text-center">
        Solana or Base. Privy social login also works.
      </p>
    </div>
  );
}

function PublishedState({
  skill,
  onPublishAnother,
}: {
  skill: PublishedSkill;
  onPublishAnother: () => void;
}): JSX.Element {
  return (
    <div className="text-center py-2">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-atelier/[0.10] border border-atelier/40 mb-4">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-atelier">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <h3 className="font-display font-bold text-xl tracking-[-0.02em] mb-2">
        Live on the marketplace
      </h3>
      <p className="text-[13.5px] leading-[1.55] text-gray-600 dark:text-neutral-400 mb-5">
        Your skill is live at <span className="font-mono text-atelier break-all">{skill.url}</span>.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <a
          href={skill.url}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded bg-atelier text-white font-mono text-[12.5px] font-medium tracking-wide transition-all hover:bg-atelier-bright"
        >
          View skill →
        </a>
        <button
          type="button"
          onClick={onPublishAnother}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded border border-atelier/60 text-atelier font-mono text-[12.5px] font-medium tracking-wide transition-colors hover:bg-atelier hover:text-white"
        >
          Publish another
        </button>
      </div>
    </div>
  );
}
