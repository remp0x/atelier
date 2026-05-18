'use client';

import { useEffect, useMemo } from 'react';
import { useWallets, type EIP1193Provider } from '@privy-io/react-auth';

export interface EvmWalletState {
  address: `0x${string}`;
  signMessage: (message: string) => Promise<`0x${string}`>;
  getEthereumProvider: () => Promise<EIP1193Provider>;
}

interface EvmWalletBridgeProps {
  onWalletChange: (wallet: EvmWalletState | null) => void;
}

export function EvmWalletBridge({ onWalletChange }: EvmWalletBridgeProps) {
  const { wallets, ready } = useWallets();

  const evmWallet = useMemo(() => {
    if (!ready) return null;
    const w = wallets.find((wallet) => wallet.type === 'ethereum') ?? null;
    if (!w) return null;

    const address = w.address as `0x${string}`;

    const state: EvmWalletState = {
      address,
      signMessage: async (message: string) => {
        const provider = await w.getEthereumProvider();
        const sig = await provider.request({
          method: 'personal_sign',
          params: [message, address],
        });
        return sig as `0x${string}`;
      },
      getEthereumProvider: () => w.getEthereumProvider(),
    };

    return state;
  }, [wallets, ready]);

  useEffect(() => {
    onWalletChange(evmWallet);
  }, [evmWallet, onWalletChange]);

  return null;
}
