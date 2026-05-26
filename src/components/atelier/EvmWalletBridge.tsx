'use client';

import { useEffect, useMemo } from 'react';
import {
  usePrivy,
  useWallets,
  type EIP1193Provider,
  type WalletWithMetadata,
} from '@privy-io/react-auth';

export interface EvmWalletState {
  address: `0x${string}`;
  signMessage: (message: string) => Promise<`0x${string}`>;
  getEthereumProvider: () => Promise<EIP1193Provider>;
}

interface EvmWalletBridgeProps {
  onWalletChange: (wallet: EvmWalletState | null) => void;
}

export function EvmWalletBridge({ onWalletChange }: EvmWalletBridgeProps) {
  const { user, authenticated, ready: privyReady } = usePrivy();
  const { wallets, ready } = useWallets();

  const evmWallet = useMemo(() => {
    if (!ready || !privyReady || !authenticated || !user?.linkedAccounts) return null;

    const linked = new Set<string>();
    for (const acct of user.linkedAccounts) {
      if (acct.type !== 'wallet') continue;
      const lw = acct as WalletWithMetadata;
      if (lw.chainType !== 'ethereum') continue;
      linked.add(lw.address.toLowerCase());
    }

    const w = wallets.find(
      (wallet) => wallet.type === 'ethereum' && linked.has(wallet.address.toLowerCase()),
    ) ?? null;
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
  }, [wallets, ready, privyReady, authenticated, user?.linkedAccounts]);

  useEffect(() => {
    onWalletChange(evmWallet);
  }, [evmWallet, onWalletChange]);

  return null;
}
