'use client';

import { useEffect, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Transaction, VersionedTransaction } from '@solana/web3.js';

interface SolanaWalletBridgeProps {
  onWalletChange: (wallet: {
    address: string;
    signMessage: (input: { message: Uint8Array }) => Promise<{ signature: Uint8Array }>;
    signTransaction: (input: { transaction: Uint8Array }) => Promise<{ signedTransaction: Uint8Array }>;
  } | null) => void;
}

export function SolanaWalletBridge({ onWalletChange }: SolanaWalletBridgeProps) {
  const { publicKey, connected, signMessage, signTransaction } = useWallet();

  const wallet = useMemo(() => {
    if (!connected || !publicKey || !signMessage || !signTransaction) return null;

    const address = publicKey.toBase58();

    return {
      address,
      signMessage: async ({ message }: { message: Uint8Array }) => {
        const signature = await signMessage(message);
        return { signature };
      },
      signTransaction: async ({ transaction }: { transaction: Uint8Array }) => {
        const tx = Transaction.from(transaction);
        const signed = await signTransaction(tx);
        const serialized = signed instanceof VersionedTransaction
          ? signed.serialize()
          : signed.serialize({ requireAllSignatures: false, verifySignatures: false });
        return { signedTransaction: new Uint8Array(serialized) };
      },
    };
  }, [connected, publicKey, signMessage, signTransaction]);

  useEffect(() => {
    onWalletChange(wallet);
  }, [wallet, onWalletChange]);

  return null;
}
