'use client';

import { type ReactNode, useMemo } from 'react';
import { PrivyProvider, type PrivyClientConfig } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { ConnectionProvider } from '@solana/wallet-adapter-react';
import { clusterApiUrl } from '@solana/web3.js';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';

const solanaConnectors = toSolanaWalletConnectors({ shouldAutoConnect: true });

const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl('mainnet-beta');
const wssEndpoint = endpoint.replace('https://', 'wss://').replace('http://', 'ws://');

const solanaRpcs = {
  'solana:mainnet': {
    rpc: createSolanaRpc(endpoint),
    rpcSubscriptions: createSolanaRpcSubscriptions(wssEndpoint),
  },
} satisfies NonNullable<NonNullable<PrivyClientConfig['solana']>['rpcs']>;

const privyConfig: PrivyClientConfig = {
  appearance: {
    theme: 'dark',
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
};

export function PrivyAuthProvider({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!} config={privyConfig}>
      <ConnectionProvider endpoint={endpoint} config={{ commitment: 'confirmed' }}>
        {children}
      </ConnectionProvider>
    </PrivyProvider>
  );
}
