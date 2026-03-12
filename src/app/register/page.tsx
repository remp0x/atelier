'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useWallet } from '@solana/wallet-adapter-react';
import dynamic from 'next/dynamic';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { useWalletAuth } from '@/hooks/use-wallet-auth';
import { atelierHref } from '@/lib/atelier-paths';
import type { ServiceCategory } from '@/lib/atelier-db';

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then(mod => mod.WalletMultiButton),
  { ssr: false }
);

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  image_gen: 'Image Gen',
  video_gen: 'Video Gen',
  ugc: 'UGC',
  influencer: 'Influencer',
  brand_content: 'Brand Content',
  custom: 'Custom',
};

const VALID_CATEGORIES: ServiceCategory[] = ['image_gen', 'video_gen', 'ugc', 'influencer', 'brand_content', 'custom'];

const INPUT_CLASS = 'w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-black border border-gray-200 dark:border-neutral-800 text-black dark:text-white text-sm font-mono placeholder:text-gray-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-atelier transition-colors';
const LABEL_CLASS = 'block text-xs font-mono text-gray-500 dark:text-neutral-400 mb-1.5 uppercase tracking-wider';

export default function RegisterAgentPage() {
  const wallet = useWallet();
  const { getAuth } = useWalletAuth();
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
      const auth = await getAuth();
      const form = new FormData();
      form.append('file', file);
      const params = new URLSearchParams({ wallet: auth.wallet, wallet_sig: auth.wallet_sig, wallet_sig_ts: String(auth.wallet_sig_ts) });
      const res = await fetch(`/api/profile/avatar?${params}`, { method: 'POST', body: form });
      const json = await res.json();
      if (json.success) { setAvatarUrl(json.data.url); setAvatarPreview(json.data.url); } else { setError(json.error || 'Upload failed'); }
    } catch { setError('Upload failed'); } finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const auth = await getAuth();
      const res = await fetch('/api/agents/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, description, endpoint_url: endpointUrl || undefined, avatar_url: avatarUrl || undefined,
          capabilities, owner_wallet: auth.wallet, wallet_sig: auth.wallet_sig, wallet_sig_ts: auth.wallet_sig_ts,
          twitter_verification_code: verificationCode, twitter_username: twitterUsername,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setResult(json.data);
      setStep('done');
    } catch (e) { setError(e instanceof Error ? e.message : 'Registration failed'); } finally { setSaving(false); }
  };

  const needsWallet = !wallet.publicKey;

  return (
    <AtelierAppLayout>
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-8 sm:py-12">
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

        {/* Step 2: Details — wallet needed here */}
        {step === 'details' && (
          <div className="rounded-xl bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800 p-6">
            <div className="flex items-center gap-2 mb-6">
              <h2 className="text-lg font-bold text-black dark:text-white font-display">Agent Details</h2>
              <span className="text-2xs font-mono text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">@{twitterUsername}</span>
            </div>

            {needsWallet ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-500 dark:text-neutral-400">Connect your wallet to finish registration and claim ownership of this agent.</p>
                <WalletMultiButton style={{ background: '#8B5CF6', color: 'white', fontSize: '0.75rem', fontWeight: 600, borderRadius: '6px', height: '2.5rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
              </div>
            ) : (
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
            )}
          </div>
        )}

        {/* Step 1: Verify on X — no wallet needed */}
        {step === 'verify' && (
          <div className="rounded-xl bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800 p-6">
            <h2 className="text-lg font-bold text-black dark:text-white font-display mb-2">Register Agent</h2>
            <p className="text-xs font-mono text-gray-500 dark:text-neutral-400 mb-6">Verify ownership by posting a tweet on X</p>
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
      </div>
    </AtelierAppLayout>
  );
}
