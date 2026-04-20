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
const SERVER_SESSION_TTL = 6 * 24 * 60 * 60 * 1000;
const STORAGE_KEY_PREFIX = 'atelier_auth_';
const APIKEY_STORAGE_KEY = 'atelier_apikey_session';
const SERVER_SESSION_KEY_PREFIX = 'atelier_server_session_';

function loadServerSessionMarker(wallet: string): boolean {
  try {
    const raw = localStorage.getItem(`${SERVER_SESSION_KEY_PREFIX}${wallet}`);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts) || Date.now() - ts >= SERVER_SESSION_TTL) {
      localStorage.removeItem(`${SERVER_SESSION_KEY_PREFIX}${wallet}`);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function saveServerSessionMarker(wallet: string): void {
  try {
    localStorage.setItem(`${SERVER_SESSION_KEY_PREFIX}${wallet}`, String(Date.now()));
  } catch {}
}

function clearServerSessionMarker(wallet: string): void {
  try {
    localStorage.removeItem(`${SERVER_SESSION_KEY_PREFIX}${wallet}`);
  } catch {}
}

interface ApiKeySession {
  apiKey: string;
  agentId: string;
  agentName?: string;
  agentAvatarUrl?: string | null;
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
  sessionReady: boolean;
  getAuth: (opts?: { silent?: boolean }) => Promise<WalletAuthPayload>;
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
  const [sessionReady, setSessionReady] = useState(false);

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

  const getAuth = useCallback(async (opts?: { silent?: boolean }): Promise<WalletAuthPayload> => {
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

    if (opts?.silent) {
      throw new Error('Auth session expired');
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

  useEffect(() => {
    if (!walletReady || !walletAddress) {
      setSessionReady(false);
      return;
    }
    if (loadServerSessionMarker(walletAddress)) {
      setSessionReady(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const payload = await getAuth();
        if (cancelled) return;
        const res = await fetch('/api/auth/session', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (json?.success) {
          saveServerSessionMarker(walletAddress);
          setSessionReady(true);
        }
      } catch {}
    })();

    return () => { cancelled = true; };
  }, [walletReady, walletAddress, getAuth]);

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
    const session: ApiKeySession = {
      apiKey,
      agentId: json.data.id,
      agentName: json.data.name ?? undefined,
      agentAvatarUrl: json.data.avatar_url ?? null,
      ts: Date.now(),
    };
    saveApiKeySession(session);
    setApiKeySess(session);
  }, []);

  const logoutApiKey = useCallback(() => {
    clearApiKeySession();
    setApiKeySess(null);
  }, []);

  const handleLogout = useCallback(async () => {
    if (walletAddress) clearServerSessionMarker(walletAddress);
    try {
      await fetch('/api/auth/session', { method: 'DELETE', credentials: 'include' });
    } catch {}
    setSessionReady(false);
    clearAuth();
    logoutApiKey();
    setSolanaWallet(null);
    await logout();
  }, [clearAuth, logoutApiKey, logout, walletAddress]);

  const value = useMemo<AtelierAuthContextValue>(
    () => ({
      authenticated: authenticated || apiKeySess !== null,
      ready,
      login,
      logout: handleLogout,
      user: user ?? null,
      walletAddress,
      walletReady,
      sessionReady,
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
      sessionReady,
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
