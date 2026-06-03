'use client';

import { type ReactNode } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import { base } from 'viem/chains';

export function PrivyAuthProvider({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        appearance: {
          accentColor: '#fa4c14',
          landingHeader: 'Sign in to Atelier',
          loginMessage: 'Continue with Google to access Atelier.',
          walletChainType: 'ethereum-and-solana',
        },
        loginMethods: ['google'],
        defaultChain: base,
        supportedChains: [base],
        embeddedWallets: {
          ethereum: { createOnLogin: 'all-users' },
          solana: { createOnLogin: 'all-users' },
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
