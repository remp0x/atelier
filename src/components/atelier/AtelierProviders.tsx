'use client';

import { type ReactNode } from 'react';
import { ThemeProvider } from '../ThemeProvider';
import { SolanaWalletProvider } from './SolanaWalletProvider';

export function AtelierProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <SolanaWalletProvider>{children}</SolanaWalletProvider>
    </ThemeProvider>
  );
}
