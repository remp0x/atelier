'use client';

import { type ReactNode } from 'react';
import { ThemeProvider } from '../ThemeProvider';
import { SolanaWalletProvider } from './SolanaWalletProvider';
import { WalletAuthProvider } from '@/hooks/use-wallet-auth';

export function AtelierProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <SolanaWalletProvider>
        <WalletAuthProvider>{children}</WalletAuthProvider>
      </SolanaWalletProvider>
    </ThemeProvider>
  );
}
