'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { linkExistingToken } from '@/lib/pumpfun-client';
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
            <img src={token.image_url} alt={token.symbol || ''} className="w-12 h-12 rounded-lg object-cover shrink-0" />
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

          <div className="flex items-center gap-1.5 shrink-0">
            {/* PumpFun – "P" lettermark derived from brand */}
            <a
              href={`https://pump.fun/coin/${token.mint}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-md bg-neutral-100 dark:bg-neutral-800/60 hover:bg-green-500/15 text-neutral-500 hover:text-green-400 transition-colors"
              title="PumpFun"
            >
              <svg className="w-4 h-4" viewBox="0 0 48 48" fill="currentColor">
                <rect x="2" y="2" width="44" height="44" rx="12" fillOpacity="0.15" />
                <path d="M16 34V14h9.2c4.4 0 7 2.4 7 6s-2.5 6-6.9 6H20v8h-4zm8.7-10c2.2 0 3.5-1.1 3.5-3s-1.3-2.9-3.5-2.9H20v5.9h4.7z" />
              </svg>
            </a>
            {/* DexScreener – "D" + slash from brand mark */}
            <a
              href={`https://dexscreener.com/solana/${token.mint}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-md bg-neutral-100 dark:bg-neutral-800/60 hover:bg-blue-500/15 text-neutral-500 hover:text-blue-400 transition-colors"
              title="DexScreener"
            >
              <svg className="w-4 h-4" viewBox="0 0 48 48" fill="currentColor">
                <rect x="2" y="2" width="44" height="44" rx="10" fillOpacity="0.15" />
                <path d="M14 32V16h7.2c4.6 0 7.3 2.6 7.3 6.9s-2.7 7.1-7.3 7.1H18.2V32H14zm5.6-4.6c2.6 0 4.1-1.5 4.1-4s-1.5-3.8-4.1-3.8H18.2v7.8h1.4z" />
                <path d="M33.8 32h-3.4l6.8-16h3.4l-6.8 16z" fillOpacity="0.85" />
              </svg>
            </a>
            {/* GeckoTerminal – gecko silhouette derived from CoinGecko brand */}
            <a
              href={`https://www.geckoterminal.com/solana/pools/${token.mint}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-md bg-neutral-100 dark:bg-neutral-800/60 hover:bg-emerald-500/15 text-neutral-500 hover:text-emerald-400 transition-colors"
              title="GeckoTerminal"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2.5 6.5a1.25 1.25 0 110 2.5 1.25 1.25 0 010-2.5zm5 0a1.25 1.25 0 110 2.5 1.25 1.25 0 010-2.5zM12 17.5c-2.33 0-4.3-1.46-5.08-3.5h10.16c-.78 2.04-2.75 3.5-5.08 3.5z" />
              </svg>
            </a>
            {/* Solscan – derived from Solscan brand (circle + scanner arc) */}
            <a
              href={`https://solscan.io/token/${token.mint}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-md bg-neutral-100 dark:bg-neutral-800/60 hover:bg-purple-500/15 text-neutral-500 hover:text-purple-400 transition-colors"
              title="Solscan"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="13" r="4" />
                <path d="M18.36 19.61c-3.67 2.96-10.22 1.9-13.62-2.08C1.01 13.16 1.44 6.6 5.73 3.06a10.66 10.66 0 0114.77.48c3.87 3.98 4.05 10.6.42 14.33l-2.58-2.7c1.37-1.93 1.8-4.13.98-6.49-1.23-3.53-5.12-5.39-8.66-4.19-3.5 1.19-5.42 4.96-4.33 8.51 1.11 3.59 4.86 5.63 8.46 4.53.72-.22 1.12-.09 1.58.44.61.71 1.32 1.33 2 2z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!ownerWallet) return null;

  if (!connected || !publicKey) {
    return (
      <div className="p-4 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800">
        <p className="text-sm text-gray-500 dark:text-neutral-500 font-mono text-center">
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
            className="flex-1 px-3 py-2 rounded bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-mono btn-atelier btn-green hover:bg-green-500/20 disabled:opacity-50"
          >
            Launch on PumpFun
          </button>
          <button
            onClick={() => setMode('byot')}
            disabled={busy}
            className="flex-1 px-3 py-2 rounded bg-atelier/10 border border-atelier/20 text-atelier text-xs font-mono btn-atelier btn-secondary hover:bg-atelier/20 disabled:opacity-50"
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
              className="flex-1 px-3 py-2 rounded bg-green-500 text-black text-xs font-bold font-mono uppercase tracking-wide btn-atelier btn-green hover:bg-green-400 disabled:opacity-50 disabled:hover:bg-green-500"
            >
              Launch Token
            </button>
            <button
              onClick={() => { setMode('none'); setError(null); setStep('idle'); }}
              disabled={busy}
              className="px-3 py-2 rounded border border-gray-200 dark:border-neutral-800 text-xs font-mono text-gray-600 dark:text-neutral-300 btn-atelier btn-secondary hover:border-neutral-500 disabled:opacity-50"
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
              className="flex-1 px-3 py-2 rounded bg-atelier text-white text-xs font-bold font-mono uppercase tracking-wide btn-atelier btn-primary hover:bg-atelier-bright disabled:opacity-50 disabled:hover:bg-atelier"
            >
              Link Token
            </button>
            <button
              onClick={() => { setMode('none'); setError(null); setStep('idle'); }}
              disabled={busy}
              className="px-3 py-2 rounded border border-gray-200 dark:border-neutral-800 text-xs font-mono text-gray-600 dark:text-neutral-300 btn-atelier btn-secondary hover:border-neutral-500 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
