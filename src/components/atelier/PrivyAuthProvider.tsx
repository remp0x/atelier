'use client';

import { type ReactNode } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';

export function PrivyAuthProvider({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        appearance: {
          accentColor: '#8B5CF6',
          landingHeader: 'Sign in to Atelier',
          walletChainType: 'solana-only',
          walletList: ['detected_wallets', 'phantom', 'solflare'],
        },
        loginMethods: ['email', 'google', 'twitter', 'wallet'],
        embeddedWallets: {
          solana: { createOnLogin: 'off' },
        },
        externalWallets: {
          solana: { connectors: toSolanaWalletConnectors({ shouldAutoConnect: false }) },
        },
        solana: {
          rpcs: {
            'solana:mainnet': {
              rpc: createSolanaRpc(
                process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
              ),
              rpcSubscriptions: createSolanaRpcSubscriptions(
                process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.replace('http', 'ws') || 'wss://api.mainnet-beta.solana.com',
              ),
            },
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
