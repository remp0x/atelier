'use client';

import { useEffect } from 'react';
import { useWallets } from '@privy-io/react-auth/solana';

interface SolanaWalletBridgeProps {
  onWalletChange: (wallet: {
    address: string;
    signMessage: (input: { message: Uint8Array }) => Promise<{ signature: Uint8Array }>;
    signTransaction: (input: { transaction: Uint8Array }) => Promise<{ signedTransaction: Uint8Array }>;
  } | null) => void;
}

export function SolanaWalletBridge({ onWalletChange }: SolanaWalletBridgeProps) {
  const { wallets } = useWallets();
  const wallet = wallets[0] ?? null;

  useEffect(() => {
    onWalletChange(wallet);
  }, [wallet, onWalletChange]);

  return null;
}
