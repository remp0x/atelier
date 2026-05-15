'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';

interface SkillGetButtonProps {
  pack: string;
  slug: string;
  price: number;
  downloadUrl: string;
  external?: boolean;
}

export function SkillGetButton({ price, downloadUrl, external }: SkillGetButtonProps) {
  const auth = useAtelierAuth();
  const isFree = price <= 0;
  const [pendingDownload, setPendingDownload] = useState(false);

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
    if (pendingDownload && auth.walletReady) {
      setPendingDownload(false);
      trigger();
    }
  }, [pendingDownload, auth.walletReady, trigger]);

  const handleClick = () => {
    if (!auth.walletReady) {
      setPendingDownload(true);
      auth.login();
      return;
    }
    trigger();
  };

  const label = isFree
    ? 'Get free'
    : `Get for $${price.toFixed(price % 1 === 0 ? 0 : 2)}`;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pendingDownload}
      className={`w-full inline-flex items-center justify-center gap-2 px-5 h-12 rounded font-mono text-[13px] font-medium tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
        pendingDownload
          ? 'bg-atelier/60 text-white/80 cursor-wait'
          : 'bg-atelier text-white hover:bg-atelier-bright hover:shadow-[0_0_20px_rgba(250,76,20,0.4)]'
      }`}
    >
      {pendingDownload ? 'Waiting for sign-in…' : `${label.toUpperCase()} →`}
    </button>
  );
}
