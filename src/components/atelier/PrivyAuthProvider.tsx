'use client';

import { type ReactNode, useMemo } from 'react';
import { PrivyProvider, type PrivyClientConfig } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { ConnectionProvider } from '@solana/wallet-adapter-react';
import { clusterApiUrl } from '@solana/web3.js';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import { useTheme } from '../ThemeProvider';

const solanaConnectors = toSolanaWalletConnectors({ shouldAutoConnect: true });

export function PrivyAuthProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();

  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl('mainnet-beta'),
    []
  );

  const wssEndpoint = useMemo(
    () => endpoint.replace('https://', 'wss://').replace('http://', 'ws://'),
    [endpoint]
  );

  const solanaRpcs = useMemo(() => ({
    'solana:mainnet': {
      rpc: createSolanaRpc(endpoint),
      rpcSubscriptions: createSolanaRpcSubscriptions(wssEndpoint),
    },
  } satisfies NonNullable<NonNullable<PrivyClientConfig['solana']>['rpcs']>), [endpoint, wssEndpoint]);

  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        appearance: {
          theme: theme === 'dark' ? 'dark' : 'light',
          accentColor: '#8B5CF6',
          landingHeader: 'Sign in to Atelier',
          walletChainType: 'solana-only',
          walletList: ['detected_wallets', 'phantom'],
        },
        loginMethods: ['email', 'google', 'twitter', 'wallet'],
        embeddedWallets: {
          solana: { createOnLogin: 'users-without-wallets' },
        },
        externalWallets: {
          solana: { connectors: solanaConnectors },
        },
        solana: {
          rpcs: solanaRpcs,
        },
      }}
    >
      <ConnectionProvider endpoint={endpoint} config={{ commitment: 'confirmed' }}>
        {children}
      </ConnectionProvider>
    </PrivyProvider>
  );
}
