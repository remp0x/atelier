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
import { createWalletClient, custom, type WalletClient } from 'viem';
import { base } from 'viem/chains';
import { signWalletAuth, type WalletAuthPayload, type SignableWallet, type WalletChain } from '@/lib/solana-auth-client';
import { signEvmWalletAuth } from '@/lib/evm-auth-client';
import type { TransactionSignableWallet } from '@/lib/solana-pay';
import type { EvmWalletState } from '@/components/atelier/EvmWalletBridge';
import { getPrivyAccessToken } from '@/lib/privy-client';
import type { AtelierUser, UserWallet } from '@/lib/atelier-db';

const SESSION_TTL = 24 * 60 * 60 * 1000;
const SERVER_SESSION_TTL = 6 * 24 * 60 * 60 * 1000;
const STORAGE_KEY_PREFIX = 'atelier_auth_';
const APIKEY_STORAGE_KEY = 'atelier_apikey_session';
const SERVER_SESSION_KEY_PREFIX = 'atelier_server_session_';
const ACTIVE_CHAIN_KEY = 'atelier_active_chain';

function chainAuthKey(chain: WalletChain, wallet: string): string {
  return `${STORAGE_KEY_PREFIX}${chain}_${wallet}`;
}

function chainServerKey(chain: WalletChain, wallet: string): string {
  return `${SERVER_SESSION_KEY_PREFIX}${chain}_${wallet}`;
}

function loadServerSessionMarker(chain: WalletChain, wallet: string): boolean {
  try {
    const newKey = chainServerKey(chain, wallet);
    let raw = localStorage.getItem(newKey);
    if (!raw && chain === 'solana') {
      const legacy = localStorage.getItem(`${SERVER_SESSION_KEY_PREFIX}${wallet}`);
      if (legacy) {
        raw = legacy;
        localStorage.setItem(newKey, legacy);
        localStorage.removeItem(`${SERVER_SESSION_KEY_PREFIX}${wallet}`);
      }
    }
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts) || Date.now() - ts >= SERVER_SESSION_TTL) {
      localStorage.removeItem(newKey);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function saveServerSessionMarker(chain: WalletChain, wallet: string): void {
  try {
    localStorage.setItem(chainServerKey(chain, wallet), String(Date.now()));
  } catch {}
}

function clearServerSessionMarker(chain: WalletChain, wallet: string): void {
  try {
    localStorage.removeItem(chainServerKey(chain, wallet));
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

function loadCachedAuth(chain: WalletChain, wallet: string): { payload: WalletAuthPayload; ts: number } | null {
  try {
    const newKey = chainAuthKey(chain, wallet);
    let raw = localStorage.getItem(newKey);
    if (!raw && chain === 'solana') {
      const legacy = localStorage.getItem(`${STORAGE_KEY_PREFIX}${wallet}`);
      if (legacy) {
        raw = legacy;
        localStorage.setItem(newKey, legacy);
        localStorage.removeItem(`${STORAGE_KEY_PREFIX}${wallet}`);
      }
    }
    if (!raw) return null;
    const { payload, ts } = JSON.parse(raw) as { payload: WalletAuthPayload; ts: number };
    if (payload.wallet !== wallet || Date.now() - ts >= SESSION_TTL) {
      localStorage.removeItem(newKey);
      return null;
    }
    return { payload, ts };
  } catch {
    return null;
  }
}

function saveCachedAuth(chain: WalletChain, payload: WalletAuthPayload, ts: number): void {
  try {
    localStorage.setItem(
      chainAuthKey(chain, payload.wallet),
      JSON.stringify({ payload, ts }),
    );
  } catch {}
}

function clearCachedAuth(chain: WalletChain, wallet: string): void {
  try {
    localStorage.removeItem(chainAuthKey(chain, wallet));
  } catch {}
}

function loadActiveChain(): WalletChain {
  try {
    const raw = localStorage.getItem(ACTIVE_CHAIN_KEY);
    if (raw === 'base' || raw === 'solana') return raw;
  } catch {}
  return 'solana';
}

function saveActiveChain(chain: WalletChain): void {
  try {
    localStorage.setItem(ACTIVE_CHAIN_KEY, chain);
  } catch {}
}

const SolanaWalletBridge = dynamic(
  () => import('@/components/atelier/SolanaWalletBridge').then(m => ({ default: m.SolanaWalletBridge })),
  { ssr: false }
);

const EvmWalletBridge = dynamic(
  () => import('@/components/atelier/EvmWalletBridge').then(m => ({ default: m.EvmWalletBridge })),
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
  solanaAddress: string | null;
  evmAddress: `0x${string}` | null;
  walletChain: WalletChain | null;
  activeChain: WalletChain;
  setActiveChain: (chain: WalletChain) => void;
  walletReady: boolean;
  sessionReady: boolean;
  ensureSession: () => Promise<boolean>;
  getAuth: (opts?: { silent?: boolean }) => Promise<WalletAuthPayload>;
  clearAuth: () => void;
  getSignableWallet: () => SignableWallet | null;
  getTransactionWallet: () => TransactionSignableWallet | null;
  getEvmWalletClient: () => Promise<{ client: WalletClient; account: `0x${string}` } | null>;
  authMode: AuthMode;
  apiKeySession: ApiKeySession | null;
  loginWithApiKey: (apiKey: string) => Promise<void>;
  logoutApiKey: () => void;
  atelierUser: AtelierUser | null;
  linkedWallets: UserWallet[];
  refreshAtelierUser: () => Promise<void>;
}

const AtelierAuthContext = createContext<AtelierAuthContextValue | null>(null);

export function AtelierAuthProvider({ children }: { children: ReactNode }) {
  const { authenticated, ready, login, logout, user } = usePrivy();
  const [solanaWallet, setSolanaWallet] = useState<SolanaWalletState | null>(null);
  const [evmWallet, setEvmWallet] = useState<EvmWalletState | null>(null);
  const [apiKeySess, setApiKeySess] = useState<ApiKeySession | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [activeChain, setActiveChainState] = useState<WalletChain>('solana');
  const [atelierUser, setAtelierUser] = useState<AtelierUser | null>(null);
  const [linkedWallets, setLinkedWallets] = useState<UserWallet[]>([]);

  const cacheRef = useRef<{ payload: WalletAuthPayload; ts: number } | null>(null);
  const inflightRef = useRef<Promise<WalletAuthPayload> | null>(null);
  const upsertedUserIdRef = useRef<string | null>(null);
  const upsertInflightRef = useRef<Promise<void> | null>(null);

  const solanaAddress = solanaWallet?.address ?? null;
  const evmAddress = evmWallet?.address ?? null;

  const walletChain: WalletChain | null = useMemo(() => {
    if (activeChain === 'base' && evmAddress) return 'base';
    if (activeChain === 'solana' && solanaAddress) return 'solana';
    if (solanaAddress) return 'solana';
    if (evmAddress) return 'base';
    return null;
  }, [activeChain, solanaAddress, evmAddress]);

  const walletAddress = walletChain === 'base' ? evmAddress : walletChain === 'solana' ? solanaAddress : null;
  const walletReady = authenticated && walletAddress !== null;

  useEffect(() => {
    setApiKeySess(loadApiKeySession());
    setActiveChainState(loadActiveChain());
  }, []);

  const setActiveChain = useCallback((chain: WalletChain) => {
    setActiveChainState(chain);
    saveActiveChain(chain);
  }, []);

  const authMode: AuthMode = useMemo(() => {
    if (walletReady) return 'wallet';
    if (apiKeySess) return 'apikey';
    if (authenticated) return 'privy';
    return null;
  }, [walletReady, apiKeySess, authenticated]);

  const handleSolanaWalletChange = useCallback((wallet: SolanaWalletState | null) => {
    setSolanaWallet(wallet);
  }, []);

  const handleEvmWalletChange = useCallback((wallet: EvmWalletState | null) => {
    setEvmWallet(wallet);
  }, []);

  const getSignableWallet = useCallback((): SignableWallet | null => {
    if (!solanaWallet || !solanaAddress) return null;

    return {
      publicKey: { toBase58: () => solanaAddress },
      signMessage: async (message: Uint8Array): Promise<Uint8Array> => {
        const result = await solanaWallet.signMessage({ message });
        return result.signature;
      },
    };
  }, [solanaWallet, solanaAddress]);

  const getTransactionWallet = useCallback((): TransactionSignableWallet | null => {
    if (!solanaWallet || !solanaAddress) return null;

    const pubkey = new PublicKey(solanaAddress);
    return {
      publicKey: pubkey,
      signTransaction: async (tx: Transaction): Promise<Transaction> => {
        const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
        const result = await solanaWallet.signTransaction({ transaction: serialized });
        return Transaction.from(result.signedTransaction);
      },
    };
  }, [solanaWallet, solanaAddress]);

  const getEvmWalletClient = useCallback(async (): Promise<{ client: WalletClient; account: `0x${string}` } | null> => {
    if (!evmWallet || !evmAddress) return null;
    const provider = await evmWallet.getEthereumProvider();
    const client = createWalletClient({
      chain: base,
      transport: custom(provider),
      account: evmAddress,
    });
    return { client, account: evmAddress };
  }, [evmWallet, evmAddress]);

  const getAuth = useCallback(async (opts?: { silent?: boolean }): Promise<WalletAuthPayload> => {
    const chain = walletChain;
    if (!chain || !walletAddress) {
      throw new Error('No wallet available for signing');
    }

    const cached = cacheRef.current;
    if (
      cached &&
      cached.payload.wallet === walletAddress &&
      cached.payload.wallet_chain === chain &&
      Date.now() - cached.ts < SESSION_TTL
    ) {
      return cached.payload;
    }

    if (inflightRef.current) {
      return inflightRef.current;
    }

    const stored = loadCachedAuth(chain, walletAddress);
    if (stored) {
      cacheRef.current = stored;
      return stored.payload;
    }

    if (opts?.silent) {
      throw new Error('Auth session expired');
    }

    const sign = async (): Promise<WalletAuthPayload> => {
      if (chain === 'solana') {
        const wallet = getSignableWallet();
        if (!wallet) throw new Error('No Solana wallet available for signing');
        return signWalletAuth(wallet);
      }
      if (!evmWallet || !evmAddress) throw new Error('No EVM wallet available for signing');
      return signEvmWalletAuth({
        address: evmAddress,
        signMessage: evmWallet.signMessage,
      });
    };

    const promise = sign()
      .then((payload) => {
        const ts = Date.now();
        cacheRef.current = { payload, ts };
        saveCachedAuth(chain, payload, ts);
        inflightRef.current = null;
        return payload;
      })
      .catch((err) => {
        inflightRef.current = null;
        throw err;
      });

    inflightRef.current = promise;
    return promise;
  }, [walletChain, walletAddress, getSignableWallet, evmWallet, evmAddress]);

  useEffect(() => {
    inflightRef.current = null;
    if (walletChain && walletAddress) {
      const stored = loadCachedAuth(walletChain, walletAddress);
      cacheRef.current = stored;
    } else {
      cacheRef.current = null;
    }
  }, [walletChain, walletAddress]);

  useEffect(() => {
    if (!walletReady || !walletChain || !walletAddress) {
      setSessionReady(false);
      return;
    }
    setSessionReady(loadServerSessionMarker(walletChain, walletAddress));
  }, [walletReady, walletChain, walletAddress]);

  const ensureSession = useCallback(async (): Promise<boolean> => {
    if (!walletReady || !walletChain || !walletAddress) return false;
    if (loadServerSessionMarker(walletChain, walletAddress)) {
      setSessionReady(true);
      return true;
    }
    try {
      const payload = await getAuth();
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return false;
      const json = await res.json();
      if (json?.success) {
        saveServerSessionMarker(walletChain, walletAddress);
        setSessionReady(true);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [walletReady, walletChain, walletAddress, getAuth]);

  const clearAuth = useCallback(() => {
    cacheRef.current = null;
    inflightRef.current = null;
    if (walletChain && walletAddress) clearCachedAuth(walletChain, walletAddress);
  }, [walletChain, walletAddress]);

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

  const upsertAtelierUser = useCallback(async (privyUserId: string): Promise<void> => {
    const token = await getPrivyAccessToken();
    if (!token) return;
    const res = await fetch('/api/auth/user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return;
    const json = (await res.json()) as {
      success: boolean;
      data?: { user: AtelierUser; wallets: UserWallet[]; is_new: boolean };
    };
    if (!json.success || !json.data) return;
    setAtelierUser(json.data.user);
    setLinkedWallets(json.data.wallets);
    upsertedUserIdRef.current = privyUserId;
  }, []);

  useEffect(() => {
    if (!ready || !authenticated || !user?.id) {
      if (!authenticated) {
        upsertedUserIdRef.current = null;
        setAtelierUser(null);
        setLinkedWallets([]);
      }
      return;
    }

    if (upsertedUserIdRef.current === user.id) return;
    if (upsertInflightRef.current) return;

    const privyUserId = user.id;
    const promise = upsertAtelierUser(privyUserId)
      .catch((err) => {
        console.error('[useAtelierAuth] upsertAtelierUser failed:', err);
      })
      .finally(() => {
        upsertInflightRef.current = null;
      });
    upsertInflightRef.current = promise;
  }, [ready, authenticated, user?.id, upsertAtelierUser]);

  const refreshAtelierUser = useCallback(async (): Promise<void> => {
    if (!authenticated || !user?.id) return;
    await upsertAtelierUser(user.id);
  }, [authenticated, user?.id, upsertAtelierUser]);

  const handleLogout = useCallback(async () => {
    if (walletChain && walletAddress) clearServerSessionMarker(walletChain, walletAddress);
    try {
      await fetch('/api/auth/session', { method: 'DELETE', credentials: 'include' });
    } catch {}
    setSessionReady(false);
    clearAuth();
    logoutApiKey();
    setSolanaWallet(null);
    setEvmWallet(null);
    upsertedUserIdRef.current = null;
    setAtelierUser(null);
    setLinkedWallets([]);
    await logout();
  }, [clearAuth, logoutApiKey, logout, walletChain, walletAddress]);

  const value = useMemo<AtelierAuthContextValue>(
    () => ({
      authenticated: authenticated || apiKeySess !== null,
      ready,
      login,
      logout: handleLogout,
      user: user ?? null,
      walletAddress,
      solanaAddress,
      evmAddress,
      walletChain,
      activeChain,
      setActiveChain,
      walletReady,
      sessionReady,
      ensureSession,
      getAuth,
      clearAuth,
      getSignableWallet,
      getTransactionWallet,
      getEvmWalletClient,
      authMode,
      apiKeySession: apiKeySess,
      loginWithApiKey,
      logoutApiKey,
      atelierUser,
      linkedWallets,
      refreshAtelierUser,
    }),
    [
      authenticated,
      ready,
      login,
      handleLogout,
      user,
      walletAddress,
      solanaAddress,
      evmAddress,
      walletChain,
      activeChain,
      setActiveChain,
      walletReady,
      sessionReady,
      ensureSession,
      getAuth,
      clearAuth,
      getSignableWallet,
      getTransactionWallet,
      getEvmWalletClient,
      authMode,
      apiKeySess,
      loginWithApiKey,
      logoutApiKey,
      atelierUser,
      linkedWallets,
      refreshAtelierUser,
    ]
  );

  return (
    <AtelierAuthContext.Provider value={value}>
      {authenticated && <SolanaWalletBridge onWalletChange={handleSolanaWalletChange} />}
      {authenticated && <EvmWalletBridge onWalletChange={handleEvmWalletChange} />}
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
