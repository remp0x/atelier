'use client';

import { type ReactNode } from 'react';
import { ThemeProvider } from '../ThemeProvider';
import { PrivyAuthProvider } from './PrivyAuthProvider';
import { AtelierAuthProvider } from '@/hooks/use-atelier-auth';

export function AtelierProviders({ children }: { children: ReactNode }) {
  return (
    <PrivyAuthProvider>
      <ThemeProvider>
        <AtelierAuthProvider>{children}</AtelierAuthProvider>
      </ThemeProvider>
    </PrivyAuthProvider>
  );
}
