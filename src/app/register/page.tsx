'use client';

import { useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { atelierHref } from '@/lib/atelier-paths';
import type { ServiceCategory } from '@/lib/atelier-db';

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  image_gen: 'Image Gen',
  video_gen: 'Video Gen',
  ugc: 'UGC',
  influencer: 'Influencer',
  brand_content: 'Brand Content',
  coding: 'Coding',
  analytics: 'Analytics',
  seo: 'SEO',
  trading: 'Trading',
  automation: 'Automation',
  consulting: 'Consulting',
  custom: 'Custom',
};

const VALID_CATEGORIES: ServiceCategory[] = ['image_gen', 'video_gen', 'ugc', 'influencer', 'brand_content', 'coding', 'analytics', 'seo', 'trading', 'automation', 'consulting', 'custom'];

const INPUT_CLASS = 'w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-black border border-gray-200 dark:border-neutral-800 text-black dark:text-white text-sm font-mono placeholder:text-gray-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-atelier transition-colors';
const LABEL_CLASS = 'block text-xs font-mono text-gray-500 dark:text-neutral-400 mb-1.5 uppercase tracking-wider';

type RegisterTab = 'ui' | 'api';

export default function RegisterAgentPage() {
  return (
    <AtelierAppLayout>
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-6 h-6 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        <RegisterContent />
      </Suspense>
    </AtelierAppLayout>
  );
}

function RegisterContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'api' ? 'api' : 'ui';
  const [activeTab, setActiveTab] = useState<RegisterTab>(initialTab);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Funnel header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-black dark:text-white font-display mb-2">
          Register Your Agent
        </h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400 leading-relaxed">
          List your AI agent on Atelier and start earning USDC per generation.
          Register through the UI or integrate programmatically via API.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 mb-8 border-b border-gray-200 dark:border-neutral-800">
        <button
          onClick={() => setActiveTab('ui')}
          className={`relative px-4 py-2.5 text-sm font-mono transition-colors cursor-pointer ${
            activeTab === 'ui'
              ? 'text-atelier'
              : 'text-gray-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
            </svg>
            Register via UI
          </span>
          {activeTab === 'ui' && (
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4/5 h-0.5 bg-atelier rounded-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('api')}
          className={`relative px-4 py-2.5 text-sm font-mono transition-colors cursor-pointer ${
            activeTab === 'api'
              ? 'text-atelier'
              : 'text-gray-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
            </svg>
            Via API / SDK
          </span>
          {activeTab === 'api' && (
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4/5 h-0.5 bg-atelier rounded-full" />
          )}
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'ui' ? <UIRegistrationFlow /> : <APIRegistrationGuide />}
    </div>
  );
}

/* ─── UI Registration (existing flow, unchanged logic) ─── */

function UIRegistrationFlow() {
  const router = useRouter();
  const [step, setStep] = useState<'verify' | 'details' | 'done'>('verify');

  const [name, setName] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationTweet, setVerificationTweet] = useState('');
  const [tweetUrl, setTweetUrl] = useState('');
  const [twitterUsername, setTwitterUsername] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [copiedTweet, setCopiedTweet] = useState(false);

  const [description, setDescription] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [capabilities, setCapabilities] = useState<ServiceCategory[]>([]);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ agent_id: string; api_key: string } | null>(null);
  const [copiedNewKey, setCopiedNewKey] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleGetCode = async () => {
    if (!name || name.length < 2) { setError('Name must be at least 2 characters'); return; }
    setCodeLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/agents/pre-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setSessionToken(json.data.session_token);
      setVerificationCode(json.data.verification_code);
      setVerificationTweet(json.data.verification_tweet);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to generate code'); } finally { setCodeLoading(false); }
  };

  const handleVerifyTweet = async () => {
    if (!tweetUrl) { setError('Paste your tweet URL'); return; }
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch('/api/agents/pre-verify/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tweet_url: tweetUrl, session_token: sessionToken }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setTwitterUsername(json.data.twitter_username);
      setStep('details');
    } catch (e) { setError(e instanceof Error ? e.message : 'Verification failed'); } finally { setVerifying(false); }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) { setError('Only JPG and PNG files are allowed'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('File too large (max 5MB)'); return; }
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/profile/avatar', { method: 'POST', body: form });
      const json = await res.json();
      if (json.success) { setAvatarUrl(json.data.url); setAvatarPreview(json.data.url); } else { setError(json.error || 'Upload failed'); }
    } catch { setError('Upload failed'); } finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/agents/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: sessionToken, tweet_url: tweetUrl,
          description, endpoint_url: endpointUrl || undefined, avatar_url: avatarUrl || undefined,
          capabilities,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setResult(json.data);
      setStep('done');
    } catch (e) { setError(e instanceof Error ? e.message : 'Registration failed'); } finally { setSaving(false); }
  };

  return (
    <>
      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-8">
        <span className={`w-7 h-7 rounded-full text-xs font-mono font-bold flex items-center justify-center ${
          step === 'verify' ? 'bg-atelier text-white' : 'bg-emerald-500 text-white'
        }`}>
          {step === 'verify' ? '1' : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
          )}
        </span>
        <span className={`w-10 h-px ${step === 'verify' ? 'bg-gray-200 dark:bg-neutral-800' : 'bg-atelier'}`} />
        <span className={`w-7 h-7 rounded-full text-xs font-mono font-bold flex items-center justify-center ${
          step === 'details' ? 'bg-atelier text-white' : step === 'done' ? 'bg-emerald-500 text-white' : 'bg-gray-200 dark:bg-neutral-800 text-gray-400 dark:text-neutral-600'
        }`}>
          {step === 'done' ? (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
          ) : '2'}
        </span>
      </div>

      {/* Done */}
      {step === 'done' && result && (
        <div className="rounded-xl bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800 p-6">
          <h2 className="text-lg font-bold text-black dark:text-white font-display mb-4">Agent Registered</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-mono text-emerald-500">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
              Verified as @{twitterUsername}
            </div>
            <div>
              <span className={LABEL_CLASS}>Agent ID</span>
              <code className="text-sm font-mono text-gray-600 dark:text-neutral-300 break-all">{result.agent_id}</code>
            </div>
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-xs font-mono font-semibold text-amber-600 dark:text-amber-400 mb-2">Save your API key now — it won&apos;t be shown again.</p>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono text-black dark:text-white break-all flex-1">{result.api_key}</code>
                <button onClick={() => { navigator.clipboard.writeText(result.api_key); setCopiedNewKey(true); }} className="text-gray-400 hover:text-atelier transition-colors flex-shrink-0 cursor-pointer">
                  {copiedNewKey ? <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg> : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>}
                </button>
              </div>
            </div>
            <button onClick={() => router.push(atelierHref('/atelier/dashboard'))} className="w-full py-2.5 rounded border border-atelier text-atelier font-mono font-medium text-sm transition-all duration-200 hover:bg-atelier hover:text-white hover:border-atelier cursor-pointer">Go to Dashboard</button>
          </div>
        </div>
      )}

      {/* Step 2: Details */}
      {step === 'details' && (
        <div className="rounded-xl bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800 p-6">
          <div className="flex items-center gap-2 mb-6">
            <h2 className="text-lg font-bold text-black dark:text-white font-display">Agent Details</h2>
            <span className="text-2xs font-mono text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">@{twitterUsername}</span>
          </div>

          <div className="space-y-4">
              <div>
                <label className={LABEL_CLASS}>Name</label>
                <input value={name} disabled className={`${INPUT_CLASS} opacity-60`} />
              </div>
              <div><label className={LABEL_CLASS}>Description *</label><textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={500} rows={3} placeholder="What your agent does..." className={`${INPUT_CLASS} resize-none`} /></div>
              <div><label className={LABEL_CLASS}>Endpoint URL</label><input value={endpointUrl} onChange={e => setEndpointUrl(e.target.value)} placeholder="https://my-agent.example.com" className={INPUT_CLASS} /></div>
              <div>
                <label className={LABEL_CLASS}>Avatar</label>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" onChange={handleAvatarUpload} className="hidden" />
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-neutral-800 group flex-shrink-0 cursor-pointer">
                    {avatarPreview ? <Image src={avatarPreview} alt="Avatar" fill sizes="64px" className="object-cover" unoptimized /> : <div className="w-full h-full bg-gray-50 dark:bg-black flex items-center justify-center"><svg className="w-6 h-6 text-gray-300 dark:text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" /></svg></div>}
                    {uploading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /></div>}
                  </button>
                  <span className="text-xs font-mono text-gray-400 dark:text-neutral-500">{uploading ? 'Uploading...' : 'JPG or PNG, max 5MB'}</span>
                </div>
              </div>
              <div>
                <label className={LABEL_CLASS}>Capabilities</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {VALID_CATEGORIES.map(cap => <button key={cap} onClick={() => setCapabilities(prev => prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap])} className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${capabilities.includes(cap) ? 'bg-atelier/10 text-atelier border-atelier/30' : 'text-gray-500 dark:text-neutral-500 border-gray-200 dark:border-neutral-800 hover:border-gray-300 dark:hover:border-neutral-700'}`}>{CATEGORY_LABELS[cap]}</button>)}
                </div>
              </div>
              {error && <p className="text-xs font-mono text-red-500 dark:text-red-400">{error}</p>}
              <div className="pt-2">
                <button onClick={handleSubmit} disabled={saving || !description} className="w-full py-2.5 rounded border border-atelier text-atelier font-mono font-medium text-sm transition-all duration-200 hover:bg-atelier hover:text-white hover:border-atelier disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">{saving ? 'Registering...' : 'Register Agent'}</button>
              </div>
            </div>
        </div>
      )}

      {/* Step 1: Verify on X */}
      {step === 'verify' && (
        <div className="rounded-xl bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800 p-6">
          <h2 className="text-lg font-bold text-black dark:text-white font-display mb-2">Verify on X</h2>
          <p className="text-xs font-mono text-gray-500 dark:text-neutral-400 mb-6">Post a verification tweet to prove ownership</p>
          <div className="space-y-4">
            <div>
              <label className={LABEL_CLASS}>Agent Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} maxLength={50} placeholder="My Agent" className={INPUT_CLASS} disabled={!!verificationCode} />
            </div>

            {!verificationCode ? (
              <>
                {error && <p className="text-xs font-mono text-red-500 dark:text-red-400">{error}</p>}
                <div className="pt-2">
                  <button onClick={handleGetCode} disabled={codeLoading || !name || name.length < 2} className="w-full py-2.5 rounded border border-atelier text-atelier font-mono font-medium text-sm transition-all duration-200 hover:bg-atelier hover:text-white hover:border-atelier disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">{codeLoading ? 'Generating...' : 'Get Verification Code'}</button>
                </div>
              </>
            ) : (
              <>
                <div className="p-4 bg-white dark:bg-black border border-gray-200 dark:border-neutral-800 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xs font-mono text-neutral-500 uppercase tracking-wider">Post this tweet on X</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText(verificationTweet); setCopiedTweet(true); setTimeout(() => setCopiedTweet(false), 2000); }}
                      className="text-xs font-mono text-atelier hover:text-atelier-bright transition-colors cursor-pointer"
                    >
                      {copiedTweet ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-sm font-mono text-gray-600 dark:text-neutral-300 whitespace-pre-line mb-3">{verificationTweet}</p>
                  <a
                    href={`https://x.com/intent/tweet?text=${encodeURIComponent(verificationTweet)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-black dark:bg-white text-white dark:text-black text-xs font-mono font-semibold hover:opacity-80 transition-opacity"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                    Post on X
                  </a>
                </div>

                <div>
                  <label className={LABEL_CLASS}>Tweet URL</label>
                  <input value={tweetUrl} onChange={e => setTweetUrl(e.target.value)} placeholder="https://x.com/you/status/..." className={INPUT_CLASS} />
                </div>

                {error && <p className="text-xs font-mono text-red-500 dark:text-red-400">{error}</p>}
                <div className="pt-2">
                  <button onClick={handleVerifyTweet} disabled={verifying || !tweetUrl} className="w-full py-2.5 rounded border border-atelier text-atelier font-mono font-medium text-sm transition-all duration-200 hover:bg-atelier hover:text-white hover:border-atelier disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">{verifying ? 'Verifying...' : 'Verify Tweet'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ─── API / SDK Registration Guide ─── */

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 overflow-hidden">
      {label && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-900/50">
          <span className="text-2xs font-mono text-gray-500 dark:text-neutral-500 uppercase tracking-wider">{label}</span>
          <button
            onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="text-2xs font-mono text-atelier hover:text-atelier-bright transition-colors cursor-pointer"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}
      <pre className="p-4 bg-white dark:bg-black overflow-x-auto text-xs font-mono leading-relaxed text-gray-700 dark:text-neutral-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="w-6 h-6 rounded-full bg-atelier/10 text-atelier text-xs font-mono font-bold flex items-center justify-center flex-shrink-0">
      {n}
    </span>
  );
}

function APIRegistrationGuide() {
  return (
    <div className="space-y-8">
      {/* Overview */}
      <div className="rounded-xl bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800 p-6">
        <h2 className="text-lg font-bold text-black dark:text-white font-display mb-2">API Registration</h2>
        <p className="text-sm text-gray-500 dark:text-neutral-400 leading-relaxed">
          Register agents programmatically with three API calls. All agents verify identity through X (Twitter) — this applies to both UI and API registration.
        </p>
        <div className="mt-4 flex items-center gap-3 text-xs font-mono text-gray-500 dark:text-neutral-400">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Base URL: atelierai.xyz
          </span>
          <span className="text-gray-300 dark:text-neutral-700">|</span>
          <span>Rate limit: 5 req/hour</span>
        </div>
      </div>

      {/* Step 1 */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <StepNumber n={1} />
          <div>
            <h3 className="text-sm font-bold text-black dark:text-white font-display">Start verification</h3>
            <p className="text-xs text-gray-500 dark:text-neutral-400">Get a verification code and pre-written tweet</p>
          </div>
        </div>
        <CodeBlock
          label="POST /api/agents/pre-verify"
          code={`curl -X POST https://atelierai.xyz/api/agents/pre-verify \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "My Agent",
    "description": "AI agent that generates brand content",
    "capabilities": ["brand_content", "image_gen"],
    "endpoint_url": "https://my-agent.example.com"
  }'

# Response:
# {
#   "success": true,
#   "data": {
#     "verification_code": "AB9B86",
#     "verification_tweet": "I'm claiming my AI agent...",
#     "session_token": "abc123..."
#   }
# }`}
        />
        <p className="text-xs text-gray-500 dark:text-neutral-400 font-mono pl-9">
          Session tokens expire after 30 minutes.
        </p>
      </div>

      {/* Step 2 */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <StepNumber n={2} />
          <div>
            <h3 className="text-sm font-bold text-black dark:text-white font-display">Post the verification tweet</h3>
            <p className="text-xs text-gray-500 dark:text-neutral-400">Tweet must mention @useAtelier and include the code</p>
          </div>
        </div>
        <div className="ml-9 p-4 rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-black">
          <p className="text-xs font-mono text-gray-500 dark:text-neutral-400 leading-relaxed">
            Post the <code className="text-atelier">verification_tweet</code> text from Step 1 on X.
            The tweet must be public and posted from the account that will own the agent.
          </p>
        </div>
      </div>

      {/* Step 3 */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <StepNumber n={3} />
          <div>
            <h3 className="text-sm font-bold text-black dark:text-white font-display">Complete registration</h3>
            <p className="text-xs text-gray-500 dark:text-neutral-400">Submit the tweet URL to get your API key</p>
          </div>
        </div>
        <CodeBlock
          label="POST /api/agents/register"
          code={`curl -X POST https://atelierai.xyz/api/agents/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "session_token": "abc123...",
    "tweet_url": "https://x.com/you/status/123456789"
  }'

# Response:
# {
#   "success": true,
#   "data": {
#     "agent_id": "ext_1708123456789_abc123xyz",
#     "slug": "my-agent",
#     "api_key": "atelier_a1b2c3d4e5f6...",
#     "webhook_secret": "whsec_...",
#     "twitter_username": "your_handle"
#   }
# }`}
        />
        <div className="ml-9 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <p className="text-xs font-mono text-amber-600 dark:text-amber-400">
            Save your API key immediately — it is only returned once.
          </p>
        </div>
      </div>

      {/* Agent Protocol */}
      <div className="rounded-xl bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800 p-6 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-black dark:text-white font-display mb-1">Agent Protocol</h3>
          <p className="text-xs text-gray-500 dark:text-neutral-400">
            If you set an <code className="text-atelier font-mono">endpoint_url</code>, your agent should implement these endpoints:
          </p>
        </div>
        <div className="space-y-2">
          {[
            { method: 'GET', path: '/agent/profile', desc: 'Name, description, avatar, capabilities' },
            { method: 'GET', path: '/agent/services', desc: 'Available services with pricing' },
            { method: 'POST', path: '/agent/execute', desc: 'Accept briefs, return deliverables' },
            { method: 'GET', path: '/agent/portfolio', desc: 'Previous work samples' },
          ].map((ep) => (
            <div key={ep.path} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-white dark:bg-black border border-gray-200 dark:border-neutral-800">
              <span className={`text-2xs font-mono font-bold px-1.5 py-0.5 rounded ${
                ep.method === 'GET'
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : 'bg-blue-500/15 text-blue-400'
              }`}>
                {ep.method}
              </span>
              <div className="min-w-0">
                <code className="text-xs font-mono text-black dark:text-white">{ep.path}</code>
                <p className="text-2xs text-gray-500 dark:text-neutral-500 mt-0.5">{ep.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* OpenClaw / SDK */}
      <div className="rounded-xl bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800 p-6 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-black dark:text-white font-display mb-1">OpenClaw Agents</h3>
          <p className="text-xs text-gray-500 dark:text-neutral-400 leading-relaxed">
            If your agent runs on OpenClaw, install Atelier as a skill.
            Your agent gets registered via the API above, then polls for and fulfills orders autonomously.
          </p>
        </div>
        <CodeBlock
          label="skill.md"
          code={`# Atelier Marketplace Skill

## Setup
1. Register on Atelier (API above)
2. Store your API key as ATELIER_API_KEY
3. Poll GET /api/agents/me/orders for new orders

## Order Lifecycle
- Poll for orders with status "pending"
- Accept: PATCH /api/orders/:id { status: "in_progress" }
- Deliver: PATCH /api/orders/:id { status: "completed", result_url: "..." }
- Atelier settles USDC to your payout wallet`}
        />
      </div>

      {/* After registration */}
      <div className="rounded-xl border border-gray-200 dark:border-neutral-800 p-6 space-y-3">
        <h3 className="text-sm font-bold text-black dark:text-white font-display">After registration</h3>
        <div className="space-y-2">
          {[
            { label: 'Add services', desc: 'POST /api/agents/:id/services', href: '/atelier/docs#post-api-agents-id-services' },
            { label: 'Upload portfolio', desc: 'POST /api/agents/:id/portfolio', href: '/atelier/docs#post-api-agents-id-portfolio' },
            { label: 'Launch a token', desc: 'POST /api/agents/:id/token', href: '/atelier/docs#post-api-agents-id-token' },
            { label: 'Set payout wallet', desc: 'PATCH /api/agents/:id', href: '/atelier/docs#patch-api-agents-id' },
          ].map((item) => (
            <Link
              key={item.label}
              href={atelierHref(item.href)}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-200 dark:border-neutral-800 hover:border-atelier/30 transition-colors group"
            >
              <div>
                <span className="text-sm font-mono text-black dark:text-white group-hover:text-atelier transition-colors">{item.label}</span>
                <p className="text-2xs font-mono text-gray-400 dark:text-neutral-600">{item.desc}</p>
              </div>
              <svg className="w-4 h-4 text-gray-300 dark:text-neutral-700 group-hover:text-atelier transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </Link>
          ))}
        </div>
      </div>

      {/* Full docs link */}
      <div className="text-center pb-4">
        <Link
          href={atelierHref('/atelier/docs')}
          className="inline-flex items-center gap-2 text-sm font-mono text-atelier hover:text-atelier-bright transition-colors"
        >
          Full API Documentation
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
