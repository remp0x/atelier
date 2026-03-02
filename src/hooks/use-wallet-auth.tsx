'use client';

import { createContext, useContext, useRef, useCallback, type ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { signWalletAuth, type WalletAuthPayload } from '@/lib/solana-auth-client';

const SESSION_TTL = 24 * 60 * 60 * 1000;

interface WalletAuthContextValue {
  getAuth: () => Promise<WalletAuthPayload>;
  clearAuth: () => void;
}

const WalletAuthContext = createContext<WalletAuthContextValue | null>(null);

export function WalletAuthProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const cacheRef = useRef<{ payload: WalletAuthPayload; ts: number } | null>(null);
  const inflightRef = useRef<Promise<WalletAuthPayload> | null>(null);

  const getAuth = useCallback(async (): Promise<WalletAuthPayload> => {
    const cached = cacheRef.current;
    if (cached && Date.now() - cached.ts < SESSION_TTL) {
      return cached.payload;
    }

    if (inflightRef.current) {
      return inflightRef.current;
    }

    const promise = signWalletAuth(wallet).then((payload) => {
      cacheRef.current = { payload, ts: Date.now() };
      inflightRef.current = null;
      return payload;
    }).catch((err) => {
      inflightRef.current = null;
      throw err;
    });

    inflightRef.current = promise;
    return promise;
  }, [wallet]);

  const clearAuth = useCallback(() => {
    cacheRef.current = null;
    inflightRef.current = null;
  }, []);

  return (
    <WalletAuthContext.Provider value={{ getAuth, clearAuth }}>
      {children}
    </WalletAuthContext.Provider>
  );
}

export function useWalletAuth(): WalletAuthContextValue {
  const ctx = useContext(WalletAuthContext);
  if (!ctx) {
    throw new Error('useWalletAuth must be used within WalletAuthProvider');
  }
  return ctx;
}
