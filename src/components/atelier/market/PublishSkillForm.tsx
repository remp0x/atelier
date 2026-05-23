'use client';

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
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
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-200 dark:border-neutral-800 gap-3">
        <div className="font-mono text-[10px] tracking-[0.18em] text-atelier shrink-0">
          PUBLISH A SKILL
        </div>
        <CreatorChip />
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

function CreatorChip(): JSX.Element {
  const auth = useAtelierAuth();
  const [open, setOpen] = useState(false);

  const chainLabel = auth.walletChain === 'base' ? 'BASE' : 'SOL';
  const display = auth.walletAddress ? shortWallet(auth.walletAddress) : 'no wallet';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex items-center gap-2 max-w-full px-2.5 h-7 rounded-full border border-atelier/50 bg-atelier/[0.08] hover:bg-atelier/[0.14] hover:border-atelier/70 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-atelier/60"
        aria-label="Change wallet or chain"
      >
        <span className="font-mono text-[9.5px] tracking-[0.14em] text-atelier shrink-0">
          {chainLabel}
        </span>
        <span className="w-px h-3 bg-atelier/40 shrink-0" />
        <span className="font-mono text-[10.5px] text-atelier truncate">{display}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="w-3 h-3 text-atelier/70 shrink-0"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <CreatorAccountModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function CreatorAccountModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element | null {
  const auth = useAtelierAuth();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSelect = (chain: 'solana' | 'base'): void => {
    auth.setActiveChain(chain);
  };

  const handleSignOut = async (): Promise<void> => {
    onClose();
    await auth.logout();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="creator-account-title"
      className="fixed inset-0 z-[60] flex items-center justify-center"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm cursor-default"
      />
      <div className="relative w-full max-w-[400px] mx-4 rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-black-soft shadow-2xl animate-slide-up">
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 border-b border-gray-200 dark:border-neutral-800">
          <div>
            <p
              id="creator-account-title"
              className="font-mono text-[10px] tracking-[0.18em] text-atelier mb-1"
            >
              CREATOR WALLET
            </p>
            <h3 className="font-display font-bold text-base tracking-[-0.02em] text-black dark:text-white">
              Choose chain & wallet
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 w-7 h-7 rounded-md inline-flex items-center justify-center text-gray-500 dark:text-neutral-400 hover:text-atelier hover:bg-gray-100 dark:hover:bg-neutral-900 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-[12.5px] leading-[1.5] text-gray-600 dark:text-neutral-400">
            Payouts and creator credit go to the wallet you pick here. Pick the chain you want to be paid on.
          </p>

          <div className="space-y-2">
            <ChainOption
              chain="solana"
              label="Solana"
              address={auth.solanaAddress}
              active={auth.walletChain === 'solana'}
              onSelect={() => handleSelect('solana')}
            />
            <ChainOption
              chain="base"
              label="Base"
              address={auth.evmAddress}
              active={auth.walletChain === 'base'}
              onSelect={() => handleSelect('base')}
            />
          </div>

          {!auth.solanaAddress && !auth.evmAddress && (
            <p className="text-[11.5px] font-mono leading-[1.5] text-amber-600 dark:text-amber-400">
              No wallet detected yet. If you logged in with email or social, Privy is still
              provisioning your embedded wallet — give it a few seconds.
            </p>
          )}

          <div className="pt-3 border-t border-gray-200 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 font-mono text-[11.5px] hover:border-red-500/50 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            >
              Sign out of Atelier
            </button>
            <p className="mt-2 text-[10.5px] font-mono text-gray-500 dark:text-neutral-500 text-center leading-[1.5]">
              Signs you out of Privy. External wallets stay connected to your browser.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChainOption({
  chain,
  label,
  address,
  active,
  onSelect,
}: {
  chain: 'solana' | 'base';
  label: string;
  address: string | null;
  active: boolean;
  onSelect: () => void;
}): JSX.Element {
  const hasWallet = !!address;
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!hasWallet}
      className={`w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-lg border text-left transition-colors ${
        active
          ? 'border-atelier/70 bg-atelier/[0.10]'
          : hasWallet
            ? 'border-gray-200 dark:border-neutral-700 hover:border-atelier/40 hover:bg-atelier/[0.04]'
            : 'border-gray-200 dark:border-neutral-800 opacity-50 cursor-not-allowed'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={`inline-flex items-center justify-center w-7 h-7 rounded-full font-mono text-[10px] tracking-wide shrink-0 ${
            chain === 'solana'
              ? 'bg-[#9945FF]/15 text-[#c084fc] border border-[#9945FF]/40'
              : 'bg-[#0052FF]/15 text-[#5b8dff] border border-[#0052FF]/40'
          }`}
        >
          {chain === 'solana' ? 'SOL' : 'BASE'}
        </span>
        <div className="min-w-0">
          <div className="font-display font-semibold text-[13px] text-black dark:text-white leading-tight">
            {label}
          </div>
          <div className="font-mono text-[10.5px] text-gray-500 dark:text-neutral-400 truncate">
            {address ?? 'no wallet linked'}
          </div>
        </div>
      </div>
      {active && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4 text-atelier shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      )}
    </button>
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
