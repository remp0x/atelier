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
const STORAGE_KEY_PREFIX = 'atelier_auth_';
const APIKEY_STORAGE_KEY = 'atelier_apikey_session';

interface ApiKeySession {
  apiKey: string;
  agentId: string;
  ts: number;
}

function loadApiKeySession(): ApiKeySession | null {
  try {
    const raw = localStorage.getItem(APIKEY_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as ApiKeySession;
    if (Date.now() - session.ts >= SESSION_TTL) {
      localStorage.removeItem(APIKEY_STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function saveApiKeySession(session: ApiKeySession): void {
  try {
    localStorage.setItem(APIKEY_STORAGE_KEY, JSON.stringify(session));
  } catch {}
}

function clearApiKeySession(): void {
  try {
    localStorage.removeItem(APIKEY_STORAGE_KEY);
  } catch {}
}

function loadCachedAuth(wallet: string): { payload: WalletAuthPayload; ts: number } | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${wallet}`);
    if (!raw) return null;
    const { payload, ts } = JSON.parse(raw) as { payload: WalletAuthPayload; ts: number };
    if (payload.wallet !== wallet || Date.now() - ts >= SESSION_TTL) {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${wallet}`);
      return null;
    }
    return { payload, ts };
  } catch {
    return null;
  }
}

function saveCachedAuth(payload: WalletAuthPayload, ts: number): void {
  try {
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${payload.wallet}`,
      JSON.stringify({ payload, ts }),
    );
  } catch {}
}

function clearCachedAuth(wallet: string): void {
  try {
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${wallet}`);
  } catch {}
}

const SolanaWalletBridge = dynamic(
  () => import('@/components/atelier/SolanaWalletBridge').then(m => ({ default: m.SolanaWalletBridge })),
  { ssr: false }
);

interface SolanaWalletState {
  address: string;
  signMessage: (input: { message: Uint8Array }) => Promise<{ signature: Uint8Array }>;
  signTransaction: (input: { transaction: Uint8Array }) => Promise<{ signedTransaction: Uint8Array }>;
}

type AuthMode = 'wallet' | 'apikey' | 'privy' | null;

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
  authMode: AuthMode;
  apiKeySession: ApiKeySession | null;
  loginWithApiKey: (apiKey: string) => Promise<void>;
  logoutApiKey: () => void;
}

const AtelierAuthContext = createContext<AtelierAuthContextValue | null>(null);

export function AtelierAuthProvider({ children }: { children: ReactNode }) {
  const { authenticated, ready, login, logout, user } = usePrivy();
  const [solanaWallet, setSolanaWallet] = useState<SolanaWalletState | null>(null);
  const [apiKeySess, setApiKeySess] = useState<ApiKeySession | null>(null);

  const cacheRef = useRef<{ payload: WalletAuthPayload; ts: number } | null>(null);
  const inflightRef = useRef<Promise<WalletAuthPayload> | null>(null);

  const walletAddress = solanaWallet?.address ?? null;
  const walletReady = authenticated && walletAddress !== null;

  useEffect(() => {
    setApiKeySess(loadApiKeySession());
  }, []);

  const authMode: AuthMode = useMemo(() => {
    if (walletReady) return 'wallet';
    if (apiKeySess) return 'apikey';
    if (authenticated) return 'privy';
    return null;
  }, [walletReady, apiKeySess, authenticated]);

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

    if (walletAddress) {
      const stored = loadCachedAuth(walletAddress);
      if (stored) {
        cacheRef.current = stored;
        return stored.payload;
      }
    }

    const wallet = getSignableWallet();
    if (!wallet) {
      throw new Error('No Solana wallet available for signing');
    }

    const promise = signWalletAuth(wallet)
      .then((payload) => {
        const ts = Date.now();
        cacheRef.current = { payload, ts };
        saveCachedAuth(payload, ts);
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
    inflightRef.current = null;
    if (walletAddress) {
      const stored = loadCachedAuth(walletAddress);
      cacheRef.current = stored;
    } else {
      cacheRef.current = null;
    }
  }, [walletAddress]);

  const clearAuth = useCallback(() => {
    cacheRef.current = null;
    inflightRef.current = null;
    if (walletAddress) clearCachedAuth(walletAddress);
  }, [walletAddress]);

  const loginWithApiKey = useCallback(async (apiKey: string) => {
    const res = await fetch('/api/agents/me', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Invalid API key');
    const session: ApiKeySession = { apiKey, agentId: json.data.id, ts: Date.now() };
    saveApiKeySession(session);
    setApiKeySess(session);
  }, []);

  const logoutApiKey = useCallback(() => {
    clearApiKeySession();
    setApiKeySess(null);
  }, []);

  const handleLogout = useCallback(async () => {
    clearAuth();
    logoutApiKey();
    setSolanaWallet(null);
    await logout();
  }, [clearAuth, logoutApiKey, logout]);

  const value = useMemo<AtelierAuthContextValue>(
    () => ({
      authenticated: authenticated || apiKeySess !== null,
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
      authMode,
      apiKeySession: apiKeySess,
      loginWithApiKey,
      logoutApiKey,
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
      authMode,
      apiKeySess,
      loginWithApiKey,
      logoutApiKey,
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
