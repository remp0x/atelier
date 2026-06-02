'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { getPrivyAccessToken } from '@/lib/privy-client';
import { useUsdcPayment } from '@/hooks/use-usdc-payment';
import { WalletAccountModal } from '@/components/atelier/WalletAccountModal';
import { ChainLogo, chainLabel } from '@/components/atelier/ChainBadge';

interface SkillGetButtonProps {
  pack: string;
  slug: string;
  price: number;
  /** May be omitted for paid community skills until the buyer's purchase unlocks it. */
  downloadUrl?: string | null;
  external?: boolean;
  creatorChain: 'solana' | 'base';
  /** Required for paid skills so we can route payment correctly. */
  creatorWallet?: string;
}

export function SkillGetButton({
  pack,
  slug,
  price,
  downloadUrl,
  external,
  creatorChain,
  creatorWallet,
}: SkillGetButtonProps) {
  const auth = useAtelierAuth();
  const { payUsdc } = useUsdcPayment();
  const isFree = price <= 0;
  const isCommunityPaid = pack === 'community' && !isFree;
  const priceLabel = `$${price.toFixed(price % 1 === 0 ? 0 : 2)}`;

  const [pendingDownload, setPendingDownload] = useState(false);
  const [purchased, setPurchased] = useState(false);
  // Only flash "Checking access…" when we're actually about to hit the access
  // endpoint — i.e. paid skill AND wallet is connected. Anonymous viewers go
  // straight to SIGN IN TO BUY.
  const [accessChecked, setAccessChecked] = useState(!isCommunityPaid || !auth.authenticated);
  const [resolvedDownloadUrl, setResolvedDownloadUrl] = useState<string | null>(downloadUrl ?? null);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refresh purchase status from the server whenever the active wallet changes.
  useEffect(() => {
    if (!isCommunityPaid) return;
    if (!auth.authenticated) {
      setPurchased(false);
      setResolvedDownloadUrl(null);
      setAccessChecked(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getPrivyAccessToken();
        const qs = new URLSearchParams({ pack, slug });
        const res = await fetch(`/api/skills/access?${qs.toString()}`, {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cancelled) return;
        const json = await res.json();
        if (json?.success && json.data?.purchased) {
          setPurchased(true);
          setResolvedDownloadUrl(json.data.download_url ?? null);
        } else {
          setPurchased(false);
          setResolvedDownloadUrl(null);
        }
      } catch {
        if (!cancelled) {
          setPurchased(false);
          setResolvedDownloadUrl(null);
        }
      } finally {
        if (!cancelled) setAccessChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.authenticated, isCommunityPaid, pack, slug]);

  const triggerDownload = useCallback(
    (url: string) => {
      if (external) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }
      const a = document.createElement('a');
      a.href = url;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
    [external],
  );

  useEffect(() => {
    if (!pendingDownload) return;
    if (!auth.walletReady) return;
    const url = resolvedDownloadUrl ?? downloadUrl ?? null;
    if (!isFree && !purchased) return;
    if (!url) return;
    setPendingDownload(false);
    triggerDownload(url);
  }, [pendingDownload, auth.walletReady, isFree, purchased, resolvedDownloadUrl, downloadUrl, triggerDownload]);

  const handleDownloadClick = () => {
    setError(null);
    if (!auth.walletReady) {
      setPendingDownload(true);
      auth.login();
      return;
    }
    const url = resolvedDownloadUrl ?? downloadUrl ?? null;
    if (!url) {
      setError('Download link not available. Refresh and try again.');
      return;
    }
    triggerDownload(url);
  };

  const wrongChain = auth.walletReady && auth.walletChain !== creatorChain;
  const isOwnSkill =
    auth.walletReady &&
    !!creatorWallet &&
    !!auth.walletAddress &&
    creatorWallet.toLowerCase() === auth.walletAddress.toLowerCase();

  const handleBuyClick = async () => {
    setError(null);
    if (!auth.walletReady) {
      auth.login();
      return;
    }
    if (isOwnSkill) {
      setError("You can't buy your own skill.");
      return;
    }
    if (wrongChain) {
      setWalletModalOpen(true);
      return;
    }
    if (!creatorWallet) {
      setError('Creator wallet missing for this skill — cannot route payment.');
      return;
    }
    if (busy) return;

    setBusy(true);
    try {
      setStatusMsg(`Sending ${priceLabel} USDC on ${creatorChain === 'solana' ? 'Solana' : 'Base'}…`);
      const txHash = await payUsdc({ chain: creatorChain, treasury: creatorWallet, amountUsd: price });

      setStatusMsg('Verifying payment…');
      const token = await getPrivyAccessToken();
      await recordPurchase({
        pack,
        slug,
        chain: creatorChain,
        tx_hash: txHash,
        wallet: auth.walletAddress ?? '',
        token,
      });

      // Flip UI to download state; fetch the now-unlocked URL via access API.
      const qs = new URLSearchParams({ pack, slug });
      const res = await fetch(`/api/skills/access?${qs.toString()}`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (json?.success && json.data?.download_url) {
        setResolvedDownloadUrl(json.data.download_url);
      }
      setPurchased(true);
      setStatusMsg('Purchased. Click DOWNLOAD to grab the file.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed.');
      setStatusMsg(null);
    } finally {
      setBusy(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  // Free skills always show DOWNLOAD FOR FREE
  if (isFree) {
    return (
      <PrimaryButton
        disabled={pendingDownload}
        onClick={handleDownloadClick}
        label={
          pendingDownload
            ? 'Waiting for sign-in…'
            : !auth.walletReady
              ? 'SIGN IN TO DOWNLOAD →'
              : 'DOWNLOAD FOR FREE →'
        }
      />
    );
  }

  // Paid: hide everything until access check is done so we don't flash BUY/DOWNLOAD
  if (isCommunityPaid && !accessChecked) {
    return <PrimaryButton disabled label="Checking access…" onClick={() => {}} />;
  }

  // Paid + purchased → DOWNLOAD
  if (purchased) {
    return (
      <>
        <PrimaryButton
          disabled={pendingDownload}
          onClick={handleDownloadClick}
          label={pendingDownload ? 'Waiting for sign-in…' : 'DOWNLOAD →'}
        />
        {error && <ErrorLine>{error}</ErrorLine>}
      </>
    );
  }

  // Paid + not purchased → BUY FOR $X
  return (
    <>
      <PrimaryButton
        disabled={busy || isOwnSkill}
        onClick={() => void handleBuyClick()}
        label={
          busy
            ? (statusMsg ?? 'Working…')
            : !auth.walletReady
              ? `SIGN IN TO BUY · ${priceLabel} →`
              : isOwnSkill
                ? "YOU'RE THE CREATOR"
                : wrongChain
                  ? `SWITCH TO ${chainLabel(creatorChain).toUpperCase()} TO BUY →`
                  : `BUY FOR ${priceLabel} →`
        }
      />
      {error && <ErrorLine>{error}</ErrorLine>}
      {!error && busy && statusMsg && (
        <p className="mt-2 text-[11px] font-mono text-gray-500 dark:text-neutral-400 leading-[1.5]">
          {statusMsg}
        </p>
      )}
      <div className="mt-2.5 px-3 py-2 rounded-md border border-gray-200 dark:border-neutral-800 bg-gray-50/60 dark:bg-black/40 flex items-start gap-2">
        <ChainLogo chain={creatorChain} size={14} />
        <p className="text-[11px] font-mono leading-[1.5] text-gray-600 dark:text-neutral-400">
          Settled in USDC on{' '}
          <span className="text-black dark:text-white">{chainLabel(creatorChain)}</span>{' '}
          — the creator&apos;s payout chain.
          {wrongChain && (
            <>
              {' '}
              <button
                type="button"
                onClick={() => setWalletModalOpen(true)}
                className="text-atelier hover:text-atelier-bright underline-offset-2 hover:underline"
              >
                Switch your wallet
              </button>{' '}
              to continue.
            </>
          )}
        </p>
      </div>
      <WalletAccountModal
        open={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
        title={`Pay on ${chainLabel(creatorChain)}`}
        blurb={`This skill's creator gets paid on ${chainLabel(creatorChain)}, so you also pay on ${chainLabel(creatorChain)}. Connect or switch to a ${chainLabel(creatorChain)} wallet.`}
      />
    </>
  );
}

interface RecordPurchaseInput {
  pack: string;
  slug: string;
  chain: 'solana' | 'base';
  tx_hash: string;
  /** The wallet that sent USDC on-chain (the user's embedded wallet). */
  wallet: string;
  token: string | null;
}

async function recordPurchase({ token, ...body }: RecordPurchaseInput): Promise<void> {
  const res = await fetch('/api/skills/purchase', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || !json?.success) {
    throw new Error(json?.error || 'Payment recorded on-chain but verification failed.');
  }
}

function PrimaryButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full inline-flex items-center justify-center gap-2 px-5 h-12 rounded font-mono text-[13px] font-medium tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
        disabled
          ? 'bg-atelier/60 text-white/80 cursor-wait'
          : 'bg-atelier text-white hover:bg-atelier-bright hover:shadow-[0_0_20px_rgba(250,76,20,0.4)]'
      }`}
    >
      {label}
    </button>
  );
}

function ErrorLine({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <p
      role="alert"
      className="mt-2 px-3 py-2 rounded-md border border-red-500/50 bg-red-500/[0.08] font-mono text-[11px] leading-[1.5] text-red-600 dark:text-red-300"
    >
      {children}
    </p>
  );
}
