'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { WalletAccountModal } from '@/components/atelier/WalletAccountModal';
import { ChainLogo, chainLabel } from '@/components/atelier/ChainBadge';

interface SkillGetButtonProps {
  pack: string;
  slug: string;
  price: number;
  downloadUrl: string;
  external?: boolean;
  creatorChain: 'solana' | 'base';
}

const PURCHASE_KEY_PREFIX = 'atelier_skill_purchase_';

function purchaseKey(pack: string, slug: string, wallet: string): string {
  return `${PURCHASE_KEY_PREFIX}${pack}:${slug}:${wallet.toLowerCase()}`;
}

function hasPurchased(pack: string, slug: string, wallet: string | null): boolean {
  if (!wallet) return false;
  try {
    return localStorage.getItem(purchaseKey(pack, slug, wallet)) === '1';
  } catch {
    return false;
  }
}

function markPurchased(pack: string, slug: string, wallet: string): void {
  try {
    localStorage.setItem(purchaseKey(pack, slug, wallet), '1');
  } catch {}
}

export function SkillGetButton({
  pack,
  slug,
  price,
  downloadUrl,
  external,
  creatorChain,
}: SkillGetButtonProps) {
  const auth = useAtelierAuth();
  const isFree = price <= 0;
  const priceLabel = `$${price.toFixed(price % 1 === 0 ? 0 : 2)}`;

  const [pendingDownload, setPendingDownload] = useState(false);
  const [purchased, setPurchased] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  useEffect(() => {
    if (isFree) return;
    setPurchased(hasPurchased(pack, slug, auth.walletAddress));
  }, [isFree, pack, slug, auth.walletAddress]);

  const trigger = useCallback(() => {
    if (external) {
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [downloadUrl, external]);

  useEffect(() => {
    if (!pendingDownload) return;
    if (!auth.walletReady) return;
    if (!isFree && !hasPurchased(pack, slug, auth.walletAddress)) return;
    setPendingDownload(false);
    trigger();
  }, [pendingDownload, auth.walletReady, auth.walletAddress, isFree, pack, slug, trigger]);

  const handleDownloadClick = () => {
    if (!auth.walletReady) {
      setPendingDownload(true);
      auth.login();
      return;
    }
    trigger();
  };

  const wrongChain = auth.walletReady && auth.walletChain !== creatorChain;

  const handleBuyClick = () => {
    if (!auth.walletReady) {
      auth.login();
      return;
    }
    if (wrongChain) {
      setWalletModalOpen(true);
      return;
    }
    alert(
      `Paid-skill checkout is launching soon. You'll pay ${priceLabel} USDC on ${chainLabel(creatorChain)} and the skill will download automatically. For now, reach out on Telegram (t.me/atelierai) if you need access.`,
    );
  };

  // Free → DOWNLOAD FOR FREE
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

  // Paid + already purchased → DOWNLOAD
  if (purchased) {
    return (
      <PrimaryButton
        disabled={pendingDownload}
        onClick={handleDownloadClick}
        label={pendingDownload ? 'Waiting for sign-in…' : 'DOWNLOAD →'}
      />
    );
  }

  // Paid + not yet purchased → BUY FOR $X
  return (
    <>
      <PrimaryButton
        onClick={handleBuyClick}
        label={
          !auth.walletReady
            ? `SIGN IN TO BUY · ${priceLabel} →`
            : wrongChain
              ? `SWITCH TO ${chainLabel(creatorChain).toUpperCase()} TO BUY →`
              : `BUY FOR ${priceLabel} →`
        }
      />
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

export function _markSkillPurchased(pack: string, slug: string, wallet: string): void {
  markPurchased(pack, slug, wallet);
}
