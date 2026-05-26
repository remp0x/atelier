'use client';

import { useEffect, useMemo } from 'react';
import { usePrivy, type WalletWithMetadata } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';

interface SolanaWalletBridgeProps {
  onWalletChange: (wallet: {
    address: string;
    signMessage: (input: { message: Uint8Array }) => Promise<{ signature: Uint8Array }>;
    signTransaction: (input: { transaction: Uint8Array }) => Promise<{ signedTransaction: Uint8Array }>;
  } | null) => void;
}

export function SolanaWalletBridge({ onWalletChange }: SolanaWalletBridgeProps) {
  const { user, authenticated, ready } = usePrivy();
  const { wallets } = useWallets();

  const wallet = useMemo(() => {
    if (!ready || !authenticated || !user?.linkedAccounts) return null;
    const linked = new Set<string>();
    for (const acct of user.linkedAccounts) {
      if (acct.type !== 'wallet') continue;
      const w = acct as WalletWithMetadata;
      if (w.chainType !== 'solana') continue;
      linked.add(w.address);
    }
    return wallets.find((w) => linked.has(w.address)) ?? null;
  }, [wallets, user?.linkedAccounts, authenticated, ready]);

  useEffect(() => {
    onWalletChange(wallet);
  }, [wallet, onWalletChange]);

  return null;
}
