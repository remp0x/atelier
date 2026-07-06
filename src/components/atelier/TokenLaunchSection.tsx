'use client';

import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { useLinkAccount } from '@privy-io/react-auth';
import { useFundWallet as useSolanaFundWallet, useSolanaFundingPlugin } from '@privy-io/react-auth/solana';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { useSwapUsdcToSol } from '@/hooks/use-swap-sol';
import { useAgentFunding } from '@/hooks/use-agent-funding';
import { getPrivyAccessToken } from '@/lib/privy-client';
import { isAtelierAdminEmail } from '@/lib/admin-client';
import { providerLabel, agentFeePct, badgeLabelForMode, IS_CLAWPUMP } from '@/lib/token-economics';
import Image from 'next/image';
import type { MarketData } from '@/app/api/market/route';

interface TokenInfo {
  mint: string | null;
  name: string | null;
  symbol: string | null;
  image_url: string | null;
  mode: 'pumpfun' | 'clawpump' | 'byot' | null;
  creator_wallet: string | null;
  tx_hash: string | null;
  launch_attempted: boolean;
}

type LaunchStep = 'idle' | 'launching' | 'confirming' | 'saving' | 'done' | 'error';

function formatMcap(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function TokenImage({ src, symbol }: { src: string | null; symbol: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="w-12 h-12 rounded-lg bg-atelier/20 flex items-center justify-center shrink-0">
        <span className="text-lg font-bold font-mono text-atelier">$</span>
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={symbol || ''}
      width={48}
      height={48}
      className="w-12 h-12 rounded-lg object-cover shrink-0"
      unoptimized
      onError={() => setFailed(true)}
    />
  );
}

export function TokenLaunchSection({
  agentId,
  agentName,
  agentDescription,
  agentAvatarUrl,
  agentTwitterUsername,
  token,
  ownerWallet,
  onTokenSet,
  canManage,
}: {
  agentId: string;
  agentName: string;
  agentDescription?: string;
  agentAvatarUrl: string | null;
  agentTwitterUsername?: string | null;
  token: TokenInfo | null;
  ownerWallet: string | null;
  onTokenSet: () => void;
  canManage?: boolean;
}) {
  const { walletAddress, authenticated, getAuth, user, atelierUser, refreshAtelierUser } = useAtelierAuth();
  useSolanaFundingPlugin();
  const { fundWallet: fundSolWallet } = useSolanaFundWallet();
  const { swapUsdcToSol } = useSwapUsdcToSol();
  const isAdmin = isAtelierAdminEmail(user?.google?.email ?? user?.email?.address ?? null);

  const { linkTwitter } = useLinkAccount({
    onSuccess: () => { void refreshAtelierUser(); },
  });

  // Anti-spam: a token can only launch once an X account is linked. Trust the live
  // Privy session first, then the owner's persisted handle, and finally the agent's
  // own handle -- the server gate (token/launch route) already vouches on the agent
  // row, so honoring it here keeps the client and server in agreement.
  const hasLinkedX =
    (user?.linkedAccounts ?? []).some((a) => a.type === 'twitter_oauth') ||
    Boolean(atelierUser?.twitter_username) ||
    Boolean(agentTwitterUsername);

  const linkedTwitter = (user?.linkedAccounts ?? []).find((a) => a.type === 'twitter_oauth') as { username?: string } | undefined;
  const connectedXHandle = (linkedTwitter?.username || atelierUser?.twitter_username || agentTwitterUsername || '').replace(/^@+/, '');

  // Ownership may be held under the Privy identity even when the active wallet
  // differs from owner_wallet; callers that already know ownership (dashboard /
  // agent page) pass canManage. Fall back to a direct wallet match. A confirmed
  // manager sees the form regardless of owner_wallet -- the launch is signed by
  // Atelier/ClawPump, not the owner's wallet.
  const isManager = canManage ?? (!!walletAddress && walletAddress === ownerWallet);

  const [mode, setMode] = useState<'none' | 'pumpfun'>('none');
  const [resetting, setResetting] = useState(false);
  const [step, setStep] = useState<LaunchStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [marketData, setMarketData] = useState<MarketData | null>(null);

  interface ClaimInfo {
    claimableSol: number;
    minClaimSol: number;
    payoutWallet: string | null;
  }
  const [claimInfo, setClaimInfo] = useState<ClaimInfo | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimTxHash, setClaimTxHash] = useState<string | null>(null);

  // PumpFun form
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The agent's own wallet pays the launch fee in SOL. Live amounts + deposit
  // address come from /funding; polled while the form is open so a deposit or
  // swap shows up without a manual refresh.
  const { funding } = useAgentFunding(agentId, mode === 'pumpfun' && !!isManager);
  const [fundingBusy, setFundingBusy] = useState<'buy' | 'swap' | null>(null);

  const launchRequiredSol = funding?.requirements?.launch?.required_sol ?? null;
  const agentBalanceSol = funding?.balance_sol ?? null;
  const depositAddress = funding?.deposit_address ?? null;
  const launchFunded = launchRequiredSol !== null && agentBalanceSol !== null && agentBalanceSol >= launchRequiredSol;

  useEffect(() => {
    if (!IS_CLAWPUMP || token?.mode !== 'clawpump' || !token?.mint) return;
    let cancelled = false;
    (async () => {
      try {
        const privyToken = await getPrivyAccessToken();
        const res = await fetch(`/api/agents/${agentId}/token/claim`, {
          headers: privyToken ? { Authorization: `Bearer ${privyToken}` } : {},
        });
        const json = await res.json();
        if (!cancelled && json.success && json.data) {
          setClaimInfo({
            claimableSol: json.data.claimableSol,
            minClaimSol: json.data.minClaimSol,
            payoutWallet: json.data.payoutWallet ?? null,
          });
        }
      } catch {
        // owner not authed / earnings unavailable: leave the claim row hidden
      }
    })();
    return () => { cancelled = true; };
  }, [agentId, token?.mint, token?.mode]);

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

  async function handleResetLaunch() {
    setResetting(true);
    setError(null);
    try {
      const privyToken = await getPrivyAccessToken();
      const res = await fetch(`/api/admin/agents/${agentId}/clear-token-launch`, {
        method: 'POST',
        headers: privyToken ? { Authorization: `Bearer ${privyToken}` } : {},
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Reset failed');
      onTokenSet();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setResetting(false);
    }
  }

  async function handleClaim() {
    setClaiming(true);
    setClaimTxHash(null);
    try {
      const privyToken = await getPrivyAccessToken();
      const authHeaders: Record<string, string> = privyToken ? { Authorization: `Bearer ${privyToken}` } : {};
      const res = await fetch(`/api/agents/${agentId}/token/claim`, { method: 'POST', headers: authHeaders });
      const json = await res.json();
      if (!res.ok || !json.success) return;
      if (json.data?.txHash) setClaimTxHash(json.data.txHash);
      // Refresh claimable balance
      const refreshRes = await fetch(`/api/agents/${agentId}/token/claim`, { headers: authHeaders });
      const refreshJson = await refreshRes.json();
      if (refreshJson.success && refreshJson.data) {
        setClaimInfo({
          claimableSol: refreshJson.data.claimableSol,
          minClaimSol: refreshJson.data.minClaimSol,
          payoutWallet: refreshJson.data.payoutWallet ?? null,
        });
      }
    } catch {
      // Fail silently -- claim row simply stays as-is
    } finally {
      setClaiming(false);
    }
  }

  if (token?.mint) {
    return (
      <div className="rounded-lg border border-atelier/30 bg-atelier/5 dark:bg-atelier/[0.07]">
        <div className="flex items-start gap-4 p-5">
          <TokenImage src={token.image_url} symbol={token.symbol} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <span className="text-xl font-bold font-mono text-atelier">${token.symbol}</span>
              {marketData && marketData.market_cap_usd > 0 && (
                <div className="inline-flex items-center gap-1.5 rounded-md bg-atelier/10 dark:bg-atelier/15 px-2.5 py-1">
                  <span className="text-sm font-mono font-semibold text-atelier">mcap {formatMcap(marketData.market_cap_usd)}</span>
                </div>
              )}
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-mono ${
                token.mode === 'byot' ? 'bg-atelier/10 text-atelier' : 'bg-green-500/10 text-green-400'
              }`}>
                {token.mode === 'clawpump' && <img src="/clawpump_logo.png" alt="" className="w-3 h-3 rounded-sm" />}
                {badgeLabelForMode(token.mode)}
              </span>
            </div>

            {token.name && (
              <p className="text-sm text-neutral-500 font-mono mb-2">{token.name}</p>
            )}

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono text-neutral-500">CA:</span>
              <button
                onClick={() => handleCopy(token.mint!)}
                aria-label={copied ? 'Copied!' : 'Copy contract address'}
                className={`cursor-pointer inline-flex items-center gap-1.5 px-2 py-0.5 rounded transition-all duration-200 text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier/60 ${
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

          <div className="flex items-center gap-0.5 shrink-0">
            <a
              href={`https://pump.fun/coin/${token.mint}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View on PumpFun"
              title="PumpFun"
              className="cursor-pointer p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800/60 opacity-60 hover:opacity-100 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier/60"
            >
              <img src="/pumpfun.svg" alt="" className="w-5 h-5" />
            </a>
            <a
              href={`https://dexscreener.com/solana/${token.mint}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View on DexScreener"
              title="DexScreener"
              className="cursor-pointer p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800/60 opacity-60 hover:opacity-100 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier/60"
            >
              <img src="/dexscreener.svg" alt="" className="w-5 h-5 invert dark:invert-0" />
            </a>
            <a
              href={`https://solscan.io/token/${token.mint}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View on Solscan"
              title="Solscan"
              className="cursor-pointer p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800/60 opacity-60 hover:opacity-100 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier/60"
            >
              <img src="/solscan.svg" alt="" className="w-5 h-5" />
            </a>
          </div>
        </div>

        {IS_CLAWPUMP && token.mode === 'clawpump' && claimInfo !== null && (
          <div className="px-5 pb-4 border-t border-atelier/10 pt-3 space-y-2">
            <p className="text-2xs text-neutral-500 font-mono">
              Launched via {providerLabel}. You earn {agentFeePct}% of your token&apos;s creator fees.
            </p>
            {claimInfo.payoutWallet === null ? (
              <p className="text-2xs text-neutral-500 font-mono">
                Add a payout wallet to your profile to receive creator fees.
              </p>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-2xs font-mono text-neutral-400">
                  Claimable:{' '}
                  <span className="text-neutral-200">{claimInfo.claimableSol.toFixed(4)} SOL</span>
                </span>
                <button
                  onClick={handleClaim}
                  disabled={claiming || claimInfo.claimableSol < claimInfo.minClaimSol}
                  className="cursor-pointer px-2.5 py-1 rounded-md border border-atelier/40 text-atelier text-2xs font-mono font-medium transition-all duration-200 hover:bg-atelier/10 hover:border-atelier/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier/60 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5"
                >
                  {claiming && (
                    <span className="w-3 h-3 border border-atelier border-t-transparent rounded-full animate-spin inline-block" />
                  )}
                  {claiming
                    ? 'Claiming...'
                    : claimInfo.claimableSol < claimInfo.minClaimSol
                      ? 'Nothing to claim yet'
                      : 'Claim'}
                </button>
                {claimTxHash && (
                  <a
                    href={`https://solscan.io/tx/${claimTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-2xs font-mono text-atelier hover:underline"
                  >
                    View transaction
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {isManager && connectedXHandle && (
          <div className="px-5 pb-4 border-t border-atelier/10 pt-3">
            <p className="text-2xs font-mono text-neutral-500">
              X connected: <span className="text-neutral-300">@{connectedXHandle}</span> &middot; change it on your profile
            </p>
          </div>
        )}
      </div>
    );
  }

  if (!isManager) {
    if (!authenticated && ownerWallet) {
      return (
        <div className="p-4 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800">
          <p className="text-sm text-gray-500 dark:text-neutral-400 font-mono text-center">
            Sign in to launch or link a token
          </p>
        </div>
      );
    }
    return null;
  }

  if (token?.launch_attempted && !token?.mint) {
    return (
      <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-300 dark:border-yellow-700/40 space-y-3">
        <p className="text-sm text-yellow-700 dark:text-yellow-400 font-mono">
          A token launch was already attempted for this agent.{' '}
          {isAdmin
            ? 'Reset it to retry — only if no token was actually minted.'
            : (
              <>
                Contact{' '}
                <a
                  href="https://t.me/atelierai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-atelier transition-colors"
                >
                  support on Telegram
                </a>{' '}
                to resolve.
              </>
            )}
        </p>
        {error && <p className="text-xs text-red-400 font-mono">{error}</p>}
        {isAdmin && (
          <button
            onClick={handleResetLaunch}
            disabled={resetting}
            className="px-3 py-1.5 rounded border border-yellow-400/50 text-yellow-700 dark:text-yellow-400 text-xs font-mono transition-all hover:bg-yellow-400/10 disabled:opacity-50"
          >
            {resetting ? 'Resetting...' : 'Reset launch attempt'}
          </button>
        )}
      </div>
    );
  }

  const busy = step !== 'idle' && step !== 'done' && step !== 'error';

  async function uploadTokenImage(file: File): Promise<string> {
    const form = new FormData();
    form.append('file', file);
    const privyToken = await getPrivyAccessToken();
    let url = '/api/profile/avatar';
    const headers: Record<string, string> = {};
    if (privyToken) {
      headers.Authorization = `Bearer ${privyToken}`;
    } else {
      const auth = await getAuth();
      const params = new URLSearchParams({
        wallet: auth.wallet,
        wallet_sig: auth.wallet_sig,
        wallet_sig_ts: String(auth.wallet_sig_ts),
      });
      url = `/api/profile/avatar?${params.toString()}`;
    }
    const res = await fetch(url, { method: 'POST', headers, body: form });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || 'Image upload failed');
    return json.data.url as string;
  }

  async function handleImageSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    setError(null);
    try {
      setImageUrl(await uploadTokenImage(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handlePumpFunLaunch() {
    setError(null);

    try {
      setStep('launching');

      // Prefer the verified Privy token (works across multi-wallet users); fall
      // back to a wallet signature for legacy wallet-only accounts. No payment
      // step: the AGENT's wallet pays the SOL fee server-side.
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const requestBody: Record<string, unknown> = { symbol, name, description, image_url: imageUrl };

      const privyToken = await getPrivyAccessToken();
      if (privyToken) {
        headers.Authorization = `Bearer ${privyToken}`;
      } else {
        const walletAuth = await getAuth();
        Object.assign(requestBody, walletAuth);
      }

      const res = await fetch(`/api/agents/${agentId}/token/launch`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
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

  async function handleBuySol() {
    if (!funding?.deposit_address) return;
    setFundingBusy('buy');
    setError(null);
    try {
      // Floor at 0.05 SOL so the purchase clears Coinbase Onramp's $5 minimum
      // with headroom (MoonPay's floor is $20, hence the preferred provider).
      const needed = Math.max((launchRequiredSol ?? 0.04) - (agentBalanceSol ?? 0), 0.05);
      await fundSolWallet({
        address: funding.deposit_address,
        options: { asset: 'native-currency', amount: needed.toFixed(4), card: { preferredProvider: 'coinbase' } },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Funding flow failed');
    } finally {
      setFundingBusy(null);
    }
  }

  async function handleSwapForSol() {
    if (!funding?.deposit_address) return;
    setFundingBusy('swap');
    setError(null);
    try {
      // Jupiter only sponsors gas for ~$10+ swaps from SOL-less wallets, so the
      // one-click amount stays above that floor.
      await swapUsdcToSol({ amountUsd: 10, receiver: funding.deposit_address });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Swap failed');
    } finally {
      setFundingBusy(null);
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
        <div className="space-y-2.5">
          <button
            aria-label={`Launch ${agentName} token on ${providerLabel}`}
            onClick={() => { setMode('pumpfun'); setName(agentName); setDescription(agentDescription || ''); setImageUrl(agentAvatarUrl); }}
            disabled={busy}
            className="group w-full flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-xl text-white font-display font-semibold text-sm tracking-tight cursor-pointer shadow-md shadow-atelier/25 transition-all duration-200 hover:shadow-lg hover:shadow-atelier/40 hover:brightness-[1.07] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-black disabled:opacity-50 disabled:pointer-events-none"
            style={{ background: 'linear-gradient(135deg, #fa4c14 0%, #ff7a3d 100%)' }}
          >
            {IS_CLAWPUMP && (
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white shadow-sm ring-1 ring-black/5 shrink-0">
                <img src="/clawpump_logo.png" alt="" className="w-4 h-4" />
              </span>
            )}
            <span>Launch on {providerLabel}</span>
          </button>
          <p className="text-2xs font-mono text-neutral-500 dark:text-neutral-400 text-center">
            Your agent pays a small SOL launch fee &middot; it receives {agentFeePct}% of creator fees
          </p>
        </div>
      )}

      {mode === 'pumpfun' && (
        <div className="space-y-4">
          {/* Image picker */}
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-lg overflow-hidden bg-atelier/10 flex items-center justify-center shrink-0 border border-gray-200 dark:border-neutral-800">
              {imageUrl ? (
                <Image src={imageUrl} alt="Token image" width={56} height={56} className="w-14 h-14 object-cover" unoptimized />
              ) : (
                <span className="text-lg font-bold font-mono text-atelier">$</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <button
                type="button"
                aria-label={uploadingImage ? 'Uploading image' : imageUrl ? 'Change token image' : 'Upload token image'}
                onClick={() => fileInputRef.current?.click()}
                disabled={busy || uploadingImage}
                className="cursor-pointer px-3 py-1.5 rounded-md border border-gray-200 dark:border-neutral-800 text-xs font-mono text-gray-600 dark:text-neutral-300 hover:text-atelier hover:border-atelier/40 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier/60 disabled:opacity-50"
              >
                {uploadingImage ? 'Uploading...' : imageUrl ? 'Change image' : 'Upload image'}
              </button>
              <p className="mt-1 text-2xs text-neutral-500 font-mono">
                {agentAvatarUrl
                  ? "Defaults to your agent's avatar -- upload to use a different image."
                  : 'Upload a token image (your agent has no avatar).'}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handleImageSelect}
              />
            </div>
          </div>

          {/* Name + Symbol */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="token-name" className="block text-2xs font-mono text-neutral-500 mb-1">Token Name</label>
              <div className="relative">
                <input
                  id="token-name"
                  type="text"
                  placeholder="e.g. MyAgent"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                  className="w-full px-3 py-2 pr-24 rounded-lg bg-white dark:bg-black-light border border-gray-200 dark:border-neutral-800 text-sm font-mono placeholder:text-neutral-500 focus:outline-none focus:border-atelier/50 focus:ring-1 focus:ring-atelier/30 transition-colors duration-150 disabled:opacity-50"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-2xs font-mono text-atelier pointer-events-none">
                  by Atelier
                </span>
              </div>
            </div>
            <div>
              <label htmlFor="token-symbol" className="block text-2xs font-mono text-neutral-500 mb-1">Symbol</label>
              <input
                id="token-symbol"
                type="text"
                placeholder="SYMBOL"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                maxLength={10}
                disabled={busy}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-black-light border border-gray-200 dark:border-neutral-800 text-sm font-mono placeholder:text-neutral-500 focus:outline-none focus:border-atelier/50 focus:ring-1 focus:ring-atelier/30 transition-colors duration-150 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="token-description" className="block text-2xs font-mono text-neutral-500 mb-1">Description</label>
            <textarea
              id="token-description"
              placeholder="Min 20 characters"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              disabled={busy}
              className="w-full px-3 py-2 rounded-lg bg-white dark:bg-black-light border border-gray-200 dark:border-neutral-800 text-sm font-mono placeholder:text-neutral-500 focus:outline-none focus:border-atelier/50 focus:ring-1 focus:ring-atelier/30 transition-colors duration-150 resize-none disabled:opacity-50"
            />
            {IS_CLAWPUMP && description.trim().length < 20 && (
              <p className="mt-1 text-2xs font-mono text-amber-500">
                {description.trim().length}/20 characters minimum
              </p>
            )}
          </div>

          {/* X account gate */}
          {!hasLinkedX && (
            <div className="rounded-lg border border-amber-400/40 bg-amber-50 dark:bg-amber-900/10 p-3 space-y-2">
              <p className="text-2xs font-mono text-amber-600 dark:text-amber-400">
                Link an X account to launch a token -- this keeps launches spam-free.
              </p>
              <button
                type="button"
                onClick={() => { void linkTwitter(); }}
                disabled={busy}
                className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-amber-400/50 text-amber-600 dark:text-amber-400 text-2xs font-mono font-medium transition-all duration-150 hover:bg-amber-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 disabled:opacity-50"
              >
                Connect X
              </button>
            </div>
          )}
          {hasLinkedX && (
            <p className="text-2xs font-mono text-neutral-500 dark:text-neutral-400">
              X connected{connectedXHandle ? `: @${connectedXHandle}` : ''} &middot; change it on your profile
            </p>
          )}

          {/* Agent wallet funding gate: the AGENT pays its launch fee in SOL and in
              return receives the creator-fee share directly. Amounts are live. */}
          {funding && depositAddress && (
            launchFunded ? (
              <p className="text-2xs font-mono text-neutral-500 dark:text-neutral-400">
                Agent wallet ({depositAddress.slice(0, 4)}...{depositAddress.slice(-4)}) funded: {(agentBalanceSol ?? 0).toFixed(4)} SOL &middot; launch fee ~{funding.requirements.launch.cost_sol} SOL is paid by the agent
              </p>
            ) : (
              <div className="rounded-lg border border-amber-400/40 bg-amber-50 dark:bg-amber-900/10 p-3 space-y-2">
                <p className="text-2xs font-mono text-amber-600 dark:text-amber-400">
                  <span className="font-semibold">{agentName} has its own wallet</span> — separate from your
                  personal wallet. The launch fee ({launchRequiredSol} SOL) comes out of the agent&apos;s wallet,
                  which also receives its {agentFeePct}% of creator fees.
                </p>
                <button
                  type="button"
                  onClick={() => handleCopy(depositAddress)}
                  aria-label="Copy agent wallet address"
                  title="Copy agent wallet address"
                  className="cursor-pointer w-full text-left px-2.5 py-1.5 rounded-md bg-white/60 dark:bg-black/30 border border-amber-400/30 transition-all duration-150 hover:border-amber-400/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
                >
                  <span className="block text-2xs font-mono uppercase tracking-wider text-neutral-500 mb-0.5">
                    Agent wallet &middot; balance {(agentBalanceSol ?? 0).toFixed(4)} SOL {copied ? '· Copied!' : '· click to copy'}
                  </span>
                  <span className="block text-2xs font-mono break-all text-neutral-700 dark:text-neutral-300">
                    {depositAddress}
                  </span>
                </button>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => { void handleBuySol(); }}
                    disabled={busy || fundingBusy !== null}
                    className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-amber-400/50 text-amber-600 dark:text-amber-400 text-2xs font-mono font-medium transition-all duration-150 hover:bg-amber-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 disabled:opacity-50"
                  >
                    {fundingBusy === 'buy' ? 'Opening...' : 'Buy SOL (card)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleSwapForSol(); }}
                    disabled={busy || fundingBusy !== null}
                    className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-amber-400/50 text-amber-600 dark:text-amber-400 text-2xs font-mono font-medium transition-all duration-150 hover:bg-amber-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 disabled:opacity-50"
                  >
                    {fundingBusy === 'swap' ? 'Swapping...' : 'Swap $10 USDC → SOL'}
                  </button>
                </div>
                <p className="text-2xs font-mono text-neutral-500">
                  Both buttons deposit straight into the agent&apos;s wallet — you never need SOL in your own.
                  Or send SOL (Solana mainnet) to the address above from any wallet or exchange. Balance refreshes automatically.
                </p>
              </div>
            )
          )}

          {/* Busy indicator */}
          {busy && (
            <div className="flex items-center gap-2 py-1">
              <div className="w-4 h-4 border-2 border-atelier border-t-transparent rounded-full animate-spin shrink-0" />
              <span className="text-xs text-atelier font-mono">{stepLabels[step] || 'Processing...'}</span>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400 font-mono">{error}</p>
          )}

          <p className="text-2xs font-mono text-neutral-500 dark:text-neutral-400">
            Launch fee: {funding ? `~${funding.requirements.launch.cost_sol} SOL` : 'a small amount of SOL'}, paid by the agent&apos;s wallet &middot; the agent receives {agentFeePct}% of creator fees
          </p>

          {/* Actions */}
          <div className="flex gap-2.5">
            <button
              onClick={handlePumpFunLaunch}
              disabled={busy || uploadingImage || !name || !symbol || !imageUrl || !hasLinkedX || (funding !== null && !launchFunded) || (IS_CLAWPUMP && description.trim().length < 20)}
              className="cursor-pointer flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold font-mono text-white transition-all duration-200 hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-black disabled:opacity-40 disabled:pointer-events-none"
              style={{ background: 'linear-gradient(135deg, #fa4c14 0%, #ff7a3d 100%)' }}
            >
              {busy && <span className="w-3.5 h-3.5 border-2 border-white/60 border-t-white rounded-full animate-spin" />}
              {busy ? 'Launching...' : 'Launch Token'}
            </button>
            <button
              onClick={() => { setMode('none'); setError(null); setStep('idle'); }}
              disabled={busy}
              className="cursor-pointer px-4 py-2.5 rounded-lg border border-gray-200 dark:border-neutral-800 text-sm font-mono text-gray-600 dark:text-neutral-300 hover:text-atelier hover:border-atelier/40 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier/60 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>

          <p className="text-2xs text-neutral-500 font-mono flex items-center gap-1.5">
            {IS_CLAWPUMP && <img src="/clawpump_logo.png" alt="" className="w-3 h-3 shrink-0" />}
            <span>Via {providerLabel}. You earn {agentFeePct}% of creator fees.</span>
          </p>
        </div>
      )}
    </div>
  );
}
