'use client';

import { useMemo } from 'react';
import { usePrivy } from '@privy-io/react-auth';

export interface EmbeddedWalletAddresses {
  evmAddress: `0x${string}` | null;
  solanaAddress: string | null;
  ready: boolean;
}

interface EmbeddedWalletAccount {
  type?: string;
  walletClientType?: string;
  chainType?: string;
  address?: string;
}

function findEmbedded(accounts: readonly unknown[], chainType: string): string | null {
  for (const account of accounts) {
    const a = account as EmbeddedWalletAccount;
    if (
      a.type === 'wallet' &&
      a.walletClientType === 'privy' &&
      a.chainType === chainType &&
      typeof a.address === 'string' &&
      a.address.length > 0
    ) {
      return a.address;
    }
  }
  return null;
}

/**
 * Resolves the user's PRIVY EMBEDDED wallet addresses (Solana + Base) from
 * linkedAccounts. This is the wallet Atelier provisions on login -- distinct
 * from any externally-connected wallet surfaced by useAtelierAuth.
 */
export function useEmbeddedWallets(): EmbeddedWalletAddresses {
  const { ready, authenticated, user } = usePrivy();

  return useMemo(() => {
    const accounts = user?.linkedAccounts ?? [];
    const evm = findEmbedded(accounts, 'ethereum');
    const sol = findEmbedded(accounts, 'solana');
    return {
      evmAddress: evm ? (evm as `0x${string}`) : null,
      solanaAddress: sol,
      ready: ready && authenticated,
    };
  }, [ready, authenticated, user]);
}
