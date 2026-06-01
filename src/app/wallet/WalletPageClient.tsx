'use client';

import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { WalletPanel } from '@/components/atelier/WalletPanel';

export function WalletPageClient() {
  const { authenticated, ready, login } = useAtelierAuth();

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-5 h-5 rounded-full border-2 border-atelier/30 border-t-atelier animate-spin" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] px-4 text-center gap-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-atelier">WALLET</p>
        <h1 className="font-display font-bold text-xl tracking-[-0.02em] text-black dark:text-white">
          Sign in to access your wallet
        </h1>
        <p className="text-[13px] text-gray-500 dark:text-neutral-400 max-w-xs">
          Your embedded wallets are created automatically when you sign in.
        </p>
        <button
          type="button"
          onClick={login}
          className="h-10 px-5 rounded-lg font-mono text-xs font-semibold text-white bg-gradient-to-br from-[#7a2808] via-[#9a2906] to-[#c93a0a] hover:from-[#9a2906] hover:via-[#c93a0a] hover:to-[#fa4c14] transition-all"
        >
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <WalletPanel />
    </div>
  );
}
