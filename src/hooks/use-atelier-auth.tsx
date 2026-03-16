'use client';

import {
  createContext,
  useContext,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import dynamic from 'next/dynamic';
import { usePrivy } from '@privy-io/react-auth';
import type { User } from '@privy-io/react-auth';
import { PublicKey, Transaction } from '@solana/web3.js';
import { signWalletAuth, type WalletAuthPayload, type SignableWallet } from '@/lib/solana-auth-client';
import type { TransactionSignableWallet } from '@/lib/solana-pay';

const SESSION_TTL = 24 * 60 * 60 * 1000;

const SolanaWalletBridge = dynamic(
  () => import('@/components/atelier/SolanaWalletBridge').then(m => ({ default: m.SolanaWalletBridge })),
  { ssr: false }
);

interface SolanaWalletState {
  address: string;
  signMessage: (input: { message: Uint8Array }) => Promise<{ signature: Uint8Array }>;
  signTransaction: (input: { transaction: Uint8Array }) => Promise<{ signedTransaction: Uint8Array }>;
}

interface AtelierAuthContextValue {
  authenticated: boolean;
  ready: boolean;
  login: () => void;
  logout: () => Promise<void>;
  user: User | null;
  walletAddress: string | null;
  walletReady: boolean;
  getAuth: () => Promise<WalletAuthPayload>;
  clearAuth: () => void;
  getSignableWallet: () => SignableWallet | null;
  getTransactionWallet: () => TransactionSignableWallet | null;
}

const AtelierAuthContext = createContext<AtelierAuthContextValue | null>(null);

export function AtelierAuthProvider({ children }: { children: ReactNode }) {
  const { authenticated, ready, login, logout, user } = usePrivy();
  const [solanaWallet, setSolanaWallet] = useState<SolanaWalletState | null>(null);

  const cacheRef = useRef<{ payload: WalletAuthPayload; ts: number } | null>(null);
  const inflightRef = useRef<Promise<WalletAuthPayload> | null>(null);

  const walletAddress = solanaWallet?.address ?? null;
  const walletReady = authenticated && walletAddress !== null;

  const handleWalletChange = useCallback((wallet: SolanaWalletState | null) => {
    setSolanaWallet(wallet);
  }, []);

  const getSignableWallet = useCallback((): SignableWallet | null => {
    if (!solanaWallet || !walletAddress) return null;

    return {
      publicKey: { toBase58: () => walletAddress },
      signMessage: async (message: Uint8Array): Promise<Uint8Array> => {
        const result = await solanaWallet.signMessage({ message });
        return result.signature;
      },
    };
  }, [solanaWallet, walletAddress]);

  const getTransactionWallet = useCallback((): TransactionSignableWallet | null => {
    if (!solanaWallet || !walletAddress) return null;

    const pubkey = new PublicKey(walletAddress);
    return {
      publicKey: pubkey,
      signTransaction: async (tx: Transaction): Promise<Transaction> => {
        const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
        const result = await solanaWallet.signTransaction({ transaction: serialized });
        return Transaction.from(result.signedTransaction);
      },
    };
  }, [solanaWallet, walletAddress]);

  const getAuth = useCallback(async (): Promise<WalletAuthPayload> => {
    const cached = cacheRef.current;
    if (cached && cached.payload.wallet === walletAddress && Date.now() - cached.ts < SESSION_TTL) {
      return cached.payload;
    }

    if (inflightRef.current) {
      return inflightRef.current;
    }

    const wallet = getSignableWallet();
    if (!wallet) {
      throw new Error('No Solana wallet available for signing');
    }

    const promise = signWalletAuth(wallet)
      .then((payload) => {
        cacheRef.current = { payload, ts: Date.now() };
        inflightRef.current = null;
        return payload;
      })
      .catch((err) => {
        inflightRef.current = null;
        throw err;
      });

    inflightRef.current = promise;
    return promise;
  }, [walletAddress, getSignableWallet]);

  useEffect(() => {
    cacheRef.current = null;
    inflightRef.current = null;
  }, [walletAddress]);

  const clearAuth = useCallback(() => {
    cacheRef.current = null;
    inflightRef.current = null;
  }, []);

  const handleLogout = useCallback(async () => {
    clearAuth();
    setSolanaWallet(null);
    await logout();
  }, [clearAuth, logout]);

  const value = useMemo<AtelierAuthContextValue>(
    () => ({
      authenticated,
      ready,
      login,
      logout: handleLogout,
      user: user ?? null,
      walletAddress,
      walletReady,
      getAuth,
      clearAuth,
      getSignableWallet,
      getTransactionWallet,
    }),
    [
      authenticated,
      ready,
      login,
      handleLogout,
      user,
      walletAddress,
      walletReady,
      getAuth,
      clearAuth,
      getSignableWallet,
      getTransactionWallet,
    ]
  );

  return (
    <AtelierAuthContext.Provider value={value}>
      {authenticated && <SolanaWalletBridge onWalletChange={handleWalletChange} />}
      {children}
    </AtelierAuthContext.Provider>
  );
}

export function useAtelierAuth(): AtelierAuthContextValue {
  const ctx = useContext(AtelierAuthContext);
  if (!ctx) {
    throw new Error('useAtelierAuth must be used within AtelierAuthProvider');
  }
  return ctx;
}
