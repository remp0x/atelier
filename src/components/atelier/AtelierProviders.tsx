'use client';

import { type ReactNode, useMemo } from 'react';
import { ConnectionProvider } from '@solana/wallet-adapter-react';
import { clusterApiUrl } from '@solana/web3.js';
import { ThemeProvider } from '../ThemeProvider';
import { PrivyAuthProvider } from './PrivyAuthProvider';
import { AtelierAuthProvider } from '@/hooks/use-atelier-auth';

export function AtelierProviders({ children }: { children: ReactNode }) {
  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl('mainnet-beta'),
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: 'confirmed' }}>
      <PrivyAuthProvider>
        <ThemeProvider>
          <AtelierAuthProvider>{children}</AtelierAuthProvider>
        </ThemeProvider>
      </PrivyAuthProvider>
    </ConnectionProvider>
  );
}
