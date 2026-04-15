'use client';

import { type ReactNode, Suspense, useMemo } from 'react';
import { ConnectionProvider } from '@solana/wallet-adapter-react';
import { clusterApiUrl } from '@solana/web3.js';
import { ThemeProvider } from '../ThemeProvider';
import { PrivyAuthProvider } from './PrivyAuthProvider';
import { AtelierAuthProvider } from '@/hooks/use-atelier-auth';
import { ReferralCapture } from './ReferralCapture';

export function AtelierProviders({ children }: { children: ReactNode }) {
  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl('mainnet-beta'),
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: 'confirmed' }}>
      <PrivyAuthProvider>
        <ThemeProvider>
          <AtelierAuthProvider>
            <Suspense fallback={null}>
              <ReferralCapture />
            </Suspense>
            {children}
          </AtelierAuthProvider>
        </ThemeProvider>
      </PrivyAuthProvider>
    </ConnectionProvider>
  );
}
