'use client';

import { useCallback, useEffect, useState } from 'react';

export interface InjectedEthereumProvider {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

export interface EvmWalletState {
  address: `0x${string}`;
  signMessage: (message: string) => Promise<`0x${string}`>;
  getEthereumProvider: () => Promise<InjectedEthereumProvider>;
}

interface EvmWalletBridgeProps {
  onWalletChange: (wallet: EvmWalletState | null) => void;
}

type EthereumWindow = Window & { ethereum?: InjectedEthereumProvider };

function getInjectedProvider(): InjectedEthereumProvider | null {
  if (typeof window === 'undefined') return null;
  return (window as EthereumWindow).ethereum ?? null;
}

function buildState(provider: InjectedEthereumProvider, address: `0x${string}`): EvmWalletState {
  return {
    address,
    signMessage: async (message: string) => {
      const sig = await provider.request({
        method: 'personal_sign',
        params: [message, address],
      });
      return sig as `0x${string}`;
    },
    getEthereumProvider: async () => provider,
  };
}

export function EvmWalletBridge({ onWalletChange }: EvmWalletBridgeProps) {
  const [state, setState] = useState<EvmWalletState | null>(null);

  const syncAccounts = useCallback(async (provider: InjectedEthereumProvider) => {
    try {
      const accounts = (await provider.request({ method: 'eth_accounts' })) as `0x${string}`[];
      const addr = accounts[0];
      setState(addr ? buildState(provider, addr) : null);
    } catch {
      setState(null);
    }
  }, []);

  useEffect(() => {
    const provider = getInjectedProvider();
    if (!provider) {
      setState(null);
      return;
    }

    void syncAccounts(provider);

    const handleAccountsChanged = (accounts: unknown) => {
      const list = Array.isArray(accounts) ? (accounts as `0x${string}`[]) : [];
      const addr = list[0];
      setState(addr ? buildState(provider, addr) : null);
    };

    provider.on?.('accountsChanged', handleAccountsChanged);

    return () => {
      provider.removeListener?.('accountsChanged', handleAccountsChanged);
    };
  }, [syncAccounts]);

  useEffect(() => {
    onWalletChange(state);
  }, [state, onWalletChange]);

  return null;
}
