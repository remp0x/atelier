'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { linkExistingToken } from '@/lib/pumpfun-client';
import Image from 'next/image';
import { useWalletAuth } from '@/hooks/use-wallet-auth';
import type { MarketData } from '@/app/api/market/route';

interface TokenInfo {
  mint: string | null;
  name: string | null;
  symbol: string | null;
  image_url: string | null;
  mode: 'pumpfun' | 'byot' | null;
  creator_wallet: string | null;
  tx_hash: string | null;
  launch_attempted: boolean;
}

type LaunchStep = 'idle' | 'launching' | 'confirming' | 'saving' | 'done' | 'error';

const TOKEN_NAME_SUFFIX = ' by Atelier';

function formatMcap(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function TokenLaunchSection({
  agentId,
  agentName,
  agentDescription,
  agentAvatarUrl,
  token,
  ownerWallet,
  onTokenSet,
}: {
  agentId: string;
  agentName: string;
  agentDescription?: string;
  agentAvatarUrl: string | null;
  token: TokenInfo | null;
  ownerWallet: string | null;
  onTokenSet: () => void;
}) {
  const wallet = useWallet();
  const { getAuth } = useWalletAuth();
  const { publicKey, connected } = wallet;

  const [mode, setMode] = useState<'none' | 'pumpfun' | 'byot'>('none');
  const [step, setStep] = useState<LaunchStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [marketData, setMarketData] = useState<MarketData | null>(null);

  // PumpFun form
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');

  // BYOT form
  const [byotMint, setByotMint] = useState('');
  const [byotName, setByotName] = useState('');
  const [byotSymbol, setByotSymbol] = useState('');

  useEffect(() => {
    if (!token?.mint) return;
    fetch('/api/market', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mints: [token.mint] }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data[token.mint!]) {
          setMarketData(json.data[token.mint!]);
        }
      })
      .catch(() => {});
  }, [token?.mint]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (token?.mint) {
    return (
      <div className="rounded-lg border border-atelier/30 bg-atelier/5 dark:bg-atelier/[0.07]">
        <div className="flex items-start gap-4 p-5">
          {token.image_url ? (
            <Image src={token.image_url} alt={token.symbol || ''} width={48} height={48} className="w-12 h-12 rounded-lg object-cover shrink-0" unoptimized />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-atelier/20 flex items-center justify-center shrink-0">
              <span className="text-lg font-bold font-mono text-atelier">$</span>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <span className="text-xl font-bold font-mono text-atelier">${token.symbol}</span>
              {marketData && marketData.market_cap_usd > 0 && (
                <div className="inline-flex items-center gap-1.5 rounded-md bg-atelier/10 dark:bg-atelier/15 px-2.5 py-1">
                  <span className="text-sm font-mono font-semibold text-atelier">mcap {formatMcap(marketData.market_cap_usd)}</span>
                </div>
              )}
              <span className={`px-1.5 py-0.5 rounded text-2xs font-mono ${
                token.mode === 'pumpfun' ? 'bg-green-500/10 text-green-400' : 'bg-atelier/10 text-atelier'
              }`}>
                {token.mode === 'pumpfun' ? 'PumpFun' : 'BYOT'}
              </span>
            </div>

            {token.name && (
              <p className="text-sm text-neutral-500 font-mono mb-2">{token.name}</p>
            )}

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono text-neutral-500">CA:</span>
              <button
                onClick={() => handleCopy(token.mint!)}
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded transition-all duration-200 text-xs font-mono ${
                  copied
                    ? 'bg-green-500/15 text-green-500'
                    : 'text-neutral-400 hover:text-atelier hover:bg-atelier/10'
                }`}
              >
                {copied ? 'Copied!' : `${token.mint!.slice(0, 8)}...${token.mint!.slice(-6)}`}
                {!copied && (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <a
              href={`https://pump.fun/coin/${token.mint}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800/60 opacity-60 hover:opacity-100 transition-all"
              title="PumpFun"
            >
              <img src="/pumpfun.svg" alt="PumpFun" className="w-5 h-5" />
            </a>
            <a
              href={`https://dexscreener.com/solana/${token.mint}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800/60 opacity-60 hover:opacity-100 transition-all"
              title="DexScreener"
            >
              <img src="/dexscreener.svg" alt="DexScreener" className="w-5 h-5 invert dark:invert-0" />
            </a>
            <a
              href={`https://solscan.io/token/${token.mint}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800/60 opacity-60 hover:opacity-100 transition-all"
              title="Solscan"
            >
              <img src="/solscan.svg" alt="Solscan" className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (token?.launch_attempted && !token?.mint) {
    return (
      <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-300 dark:border-yellow-700/40">
        <p className="text-sm text-yellow-700 dark:text-yellow-400 font-mono">
          A token launch was already attempted for this agent. Please contact support to resolve.
        </p>
      </div>
    );
  }

  if (!ownerWallet) return null;

  if (!connected || !publicKey) {
    return (
      <div className="p-4 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800">
        <p className="text-sm text-gray-500 dark:text-neutral-400 font-mono text-center">
          Connect wallet to launch or link a token
        </p>
      </div>
    );
  }

  if (publicKey.toBase58() !== ownerWallet) {
    return null;
  }

  const busy = step !== 'idle' && step !== 'done' && step !== 'error';

  async function handlePumpFunLaunch() {
    if (!publicKey) return;
    setError(null);

    try {
      setStep('launching');
      const walletAuth = await getAuth();

      const res = await fetch(`/api/agents/${agentId}/token/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...walletAuth,
          symbol,
          name,
          description,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Launch failed: ${res.status}`);
      }

      setStep('done');
      onTokenSet();
    } catch (err) {
      setStep('error');
      setError(err instanceof Error ? err.message : 'Launch failed');
    }
  }

  async function handleByotLink() {
    if (!publicKey) return;
    setError(null);

    try {
      setStep('saving');
      const fullName = byotName.endsWith(TOKEN_NAME_SUFFIX) ? byotName : byotName + TOKEN_NAME_SUFFIX;
      const walletAuth = await getAuth();
      await linkExistingToken({
        agentId,
        mintAddress: byotMint,
        name: fullName,
        symbol: byotSymbol,
        walletPublicKey: publicKey.toBase58(),
        walletAuth,
      });
      setStep('done');
      onTokenSet();
    } catch (err) {
      setStep('error');
      setError(err instanceof Error ? err.message : 'Link failed');
    }
  }

  const stepLabels: Record<string, string> = {
    launching: 'Launching token...',
    confirming: 'Confirming transaction...',
    saving: 'Saving token info...',
  };

  return (
    <div className="p-4 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800">
      <h3 className="text-sm font-bold font-display mb-3">Agent Token</h3>

      {mode === 'none' && (
        <div className="flex gap-3">
          <button
            onClick={() => { setMode('pumpfun'); setName(agentName); setDescription(agentDescription || ''); }}
            disabled={busy}
            className="flex-1 px-3 py-2 rounded border border-green-500/30 text-green-400 text-xs font-mono transition-all duration-200 hover:bg-green-500 hover:text-black hover:border-green-500 disabled:opacity-50"
          >
            Launch on PumpFun
          </button>
          <button
            onClick={() => setMode('byot')}
            disabled={busy}
            className="flex-1 px-3 py-2 rounded border border-atelier/30 text-atelier text-xs font-mono transition-all duration-200 hover:bg-atelier/10 hover:border-atelier/50 disabled:opacity-50"
          >
            Link Existing Token
          </button>
        </div>
      )}

      {mode === 'pumpfun' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <input
                type="text"
                placeholder="Token Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
                className="w-full px-3 py-2 pr-24 rounded-lg bg-white dark:bg-black-light border border-gray-200 dark:border-neutral-800 text-sm font-mono placeholder:text-neutral-500 focus:outline-none focus:border-atelier/50 disabled:opacity-50"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-2xs font-mono text-atelier pointer-events-none">
                by Atelier
              </span>
            </div>
            <input
              type="text"
              placeholder="SYMBOL"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              maxLength={10}
              disabled={busy}
              className="px-3 py-2 rounded-lg bg-white dark:bg-black-light border border-gray-200 dark:border-neutral-800 text-sm font-mono placeholder:text-neutral-500 focus:outline-none focus:border-atelier/50 disabled:opacity-50"
            />
          </div>
          <textarea
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            disabled={busy}
            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-black-light border border-gray-200 dark:border-neutral-800 text-sm font-mono placeholder:text-neutral-500 focus:outline-none focus:border-atelier/50 resize-none disabled:opacity-50"
          />

          {busy && (
            <div className="flex items-center gap-2 py-2">
              <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-green-400 font-mono">{stepLabels[step] || 'Processing...'}</span>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400 font-mono">{error}</p>
          )}

          <div className="flex gap-3">
            <button
              onClick={handlePumpFunLaunch}
              disabled={busy || !name || !symbol}
              className="flex-1 px-3 py-2 rounded border border-green-500/50 text-green-400 text-xs font-medium font-mono transition-all duration-200 hover:bg-green-500 hover:text-black hover:border-green-500 disabled:opacity-50"
            >
              Launch Token
            </button>
            <button
              onClick={() => { setMode('none'); setError(null); setStep('idle'); }}
              disabled={busy}
              className="px-3 py-2 rounded border border-gray-200 dark:border-neutral-800 text-xs font-mono text-gray-600 dark:text-neutral-300 hover:text-atelier hover:border-atelier/40 transition-all duration-200 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
          <p className="text-2xs text-neutral-500 font-mono">
            Creator trading fees managed by Atelier. You earn 90% of your token&apos;s creator fees.
          </p>
        </div>
      )}

      {mode === 'byot' && (
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Token Mint Address"
            value={byotMint}
            onChange={(e) => setByotMint(e.target.value)}
            disabled={busy}
            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-black-light border border-gray-200 dark:border-neutral-800 text-sm font-mono placeholder:text-neutral-500 focus:outline-none focus:border-atelier/50 disabled:opacity-50"
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <input
                type="text"
                placeholder="Token Name"
                value={byotName}
                onChange={(e) => setByotName(e.target.value)}
                disabled={busy}
                className="w-full px-3 py-2 pr-24 rounded-lg bg-white dark:bg-black-light border border-gray-200 dark:border-neutral-800 text-sm font-mono placeholder:text-neutral-500 focus:outline-none focus:border-atelier/50 disabled:opacity-50"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-2xs font-mono text-atelier pointer-events-none">
                by Atelier
              </span>
            </div>
            <input
              type="text"
              placeholder="SYMBOL"
              value={byotSymbol}
              onChange={(e) => setByotSymbol(e.target.value.toUpperCase())}
              maxLength={10}
              disabled={busy}
              className="px-3 py-2 rounded-lg bg-white dark:bg-black-light border border-gray-200 dark:border-neutral-800 text-sm font-mono placeholder:text-neutral-500 focus:outline-none focus:border-atelier/50 disabled:opacity-50"
            />
          </div>

          {busy && (
            <div className="flex items-center gap-2 py-2">
              <div className="w-4 h-4 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-atelier font-mono">{stepLabels[step] || 'Processing...'}</span>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400 font-mono">{error}</p>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleByotLink}
              disabled={busy || !byotMint || !byotName || !byotSymbol}
              className="flex-1 px-3 py-2 rounded border border-atelier/60 text-atelier text-xs font-medium font-mono transition-all duration-200 hover:bg-atelier hover:text-white hover:border-atelier disabled:opacity-50"
            >
              Link Token
            </button>
            <button
              onClick={() => { setMode('none'); setError(null); setStep('idle'); }}
              disabled={busy}
              className="px-3 py-2 rounded border border-gray-200 dark:border-neutral-800 text-xs font-mono text-gray-600 dark:text-neutral-300 hover:text-atelier hover:border-atelier/40 transition-all duration-200 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
