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
import { usePrivy, useWallets, useCreateWallet } from '@privy-io/react-auth';
import {
  useWallets as useSolanaWallets,
  useSignMessage as useSolanaSignMessage,
  useCreateWallet as useCreateSolanaWallet,
} from '@privy-io/react-auth/solana';
import type { User } from '@privy-io/react-auth';
import { createWalletClient, custom } from 'viem';
import { base } from 'viem/chains';
import { signWalletAuth, type WalletAuthPayload, type SignableWallet, type WalletChain } from '@/lib/solana-auth-client';
import { signEvmWalletAuth } from '@/lib/evm-auth-client';
import { getPrivyAccessToken } from '@/lib/privy-client';
import { trackLogin, trackSignUp } from '@/lib/analytics';
import type { AtelierUser } from '@/lib/atelier-db';

const SESSION_TTL = 24 * 60 * 60 * 1000;
const SERVER_SESSION_TTL = 6 * 24 * 60 * 60 * 1000;
const STORAGE_KEY_PREFIX = 'atelier_auth_';
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

// Resolve a Privy embedded wallet address from linkedAccounts (walletClientType
// 'privy'), distinct from any externally-connected wallet.
function findEmbeddedAddress(accounts: readonly unknown[] | undefined, chainType: 'solana' | 'ethereum'): string | null {
  for (const account of accounts ?? []) {
    const a = account as { type?: string; walletClientType?: string; chainType?: string; address?: string };
    if (
      a.type === 'wallet' &&
      a.walletClientType === 'privy' &&
      a.chainType === chainType &&
      typeof a.address === 'string' &&
      a.address.length > 0
    ) {
      return a.address;
    }
  }
  return null;
}

// Every wallet address linked to the Privy account (embedded + externally
// connected), used for identity-based ownership checks where the agent's
// owner_wallet may differ from the currently-active wallet.
function collectLinkedWalletAddresses(accounts: readonly unknown[] | undefined): string[] {
  const out: string[] = [];
  for (const account of accounts ?? []) {
    const a = account as { type?: string; address?: string };
    if (a.type === 'wallet' && typeof a.address === 'string' && a.address.length > 0) {
      out.push(a.address);
    }
  }
  return out;
}

const WalletAccountModal = dynamic(
  () => import('@/components/atelier/WalletAccountModal').then(m => ({ default: m.WalletAccountModal })),
  { ssr: false }
);

type AuthMode = 'wallet' | 'privy' | null;

interface AtelierAuthContextValue {
  authenticated: boolean;
  ready: boolean;
  login: () => void;
  logout: () => Promise<void>;
  user: User | null;
  walletAddress: string | null;
  linkedWalletAddresses: string[];
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
  openWalletModal: () => void;
  authMode: AuthMode;
  atelierUser: AtelierUser | null;
  refreshAtelierUser: () => Promise<void>;
}

const AtelierAuthContext = createContext<AtelierAuthContextValue | null>(null);

export function AtelierAuthProvider({ children }: { children: ReactNode }) {
  const { authenticated, ready, login, logout, user } = usePrivy();
  const [sessionReady, setSessionReady] = useState(false);
  const [activeChain, setActiveChainState] = useState<WalletChain>('solana');
  const [atelierUser, setAtelierUser] = useState<AtelierUser | null>(null);
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  const { wallets: privyEvmWallets } = useWallets();
  const { wallets: privySolWallets } = useSolanaWallets();
  const { signMessage: solanaEmbeddedSignMessage } = useSolanaSignMessage();
  const { createWallet: createEvmWallet } = useCreateWallet();
  const { createWallet: createSolanaWallet } = useCreateSolanaWallet();

  const cacheRef = useRef<{ payload: WalletAuthPayload; ts: number } | null>(null);
  const inflightRef = useRef<Promise<WalletAuthPayload> | null>(null);
  const upsertedUserIdRef = useRef<string | null>(null);
  const upsertInflightRef = useRef<Promise<void> | null>(null);

  const linkedWalletAddresses = useMemo(() => collectLinkedWalletAddresses(user?.linkedAccounts), [user]);
  const embeddedSolanaAddress = useMemo(() => findEmbeddedAddress(user?.linkedAccounts, 'solana'), [user]);
  const embeddedEvmAddressRaw = useMemo(() => findEmbeddedAddress(user?.linkedAccounts, 'ethereum'), [user]);
  const embeddedEvmAddress = embeddedEvmAddressRaw && embeddedEvmAddressRaw.startsWith('0x')
    ? (embeddedEvmAddressRaw as `0x${string}`)
    : null;
  const embeddedSolWallet = useMemo(
    () => privySolWallets.find((w) => w.address === embeddedSolanaAddress) ?? null,
    [privySolWallets, embeddedSolanaAddress],
  );
  const embeddedEvmWallet = useMemo(
    () => privyEvmWallets.find((w) => w.walletClientType === 'privy') ?? null,
    [privyEvmWallets],
  );

  const solanaAddress = embeddedSolanaAddress;
  const evmAddress = embeddedEvmAddress;

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
    setActiveChainState(loadActiveChain());
  }, []);

  // Every signed-in user gets Atelier-provisioned embedded wallets on both
  // chains -- that is the only payout/identity wallet. Backfill them for legacy
  // accounts that predate 'all-users' provisioning so no flow ever asks the user
  // to connect an external wallet.
  const provisioningRef = useRef(false);
  useEffect(() => {
    if (!ready || !authenticated || provisioningRef.current) return;
    if (embeddedSolanaAddress && embeddedEvmAddress) return;
    provisioningRef.current = true;
    void (async () => {
      if (!embeddedEvmAddress) {
        try { await createEvmWallet(); } catch (err) { console.error('[auth] create EVM embedded failed:', err); }
      }
      if (!embeddedSolanaAddress) {
        try { await createSolanaWallet(); } catch (err) { console.error('[auth] create Solana embedded failed:', err); }
      }
    })();
  }, [ready, authenticated, embeddedSolanaAddress, embeddedEvmAddress, createEvmWallet, createSolanaWallet]);

  const setActiveChain = useCallback((chain: WalletChain) => {
    setActiveChainState(chain);
    saveActiveChain(chain);
  }, []);

  const authMode: AuthMode = useMemo(() => {
    if (walletReady) return 'wallet';
    if (authenticated) return 'privy';
    return null;
  }, [walletReady, authenticated]);

  const getSignableWallet = useCallback((): SignableWallet | null => {
    if (embeddedSolWallet && embeddedSolanaAddress) {
      const wallet = embeddedSolWallet;
      const address = embeddedSolanaAddress;
      return {
        publicKey: { toBase58: () => address },
        signMessage: async (message: Uint8Array): Promise<Uint8Array> => {
          const out = await solanaEmbeddedSignMessage({ message, wallet });
          return out.signature;
        },
      };
    }
    return null;
  }, [embeddedSolWallet, embeddedSolanaAddress, solanaEmbeddedSignMessage]);

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
      if (embeddedEvmWallet && embeddedEvmAddress) {
        const provider = await embeddedEvmWallet.getEthereumProvider();
        const client = createWalletClient({ chain: base, transport: custom(provider), account: embeddedEvmAddress });
        const address = embeddedEvmAddress;
        return signEvmWalletAuth({
          address,
          signMessage: (message: string) => client.signMessage({ account: address, message }),
        });
      }
      throw new Error('No EVM wallet available for signing');
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
  }, [walletChain, walletAddress, getSignableWallet, embeddedEvmWallet, embeddedEvmAddress]);

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
      data?: { user: AtelierUser; is_new: boolean };
    };
    if (!json.success || !json.data) return;
    setAtelierUser(json.data.user);
    upsertedUserIdRef.current = privyUserId;
    const method = json.data.user.twitter_username
      ? 'twitter'
      : json.data.user.google_email
        ? 'google'
        : 'unknown';
    if (json.data.is_new) trackSignUp(method);
    else trackLogin(method);
  }, []);

  useEffect(() => {
    if (!ready || !authenticated || !user?.id) {
      if (!authenticated) {
        upsertedUserIdRef.current = null;
        setAtelierUser(null);
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
    upsertedUserIdRef.current = null;
    setAtelierUser(null);
    await logout();
  }, [clearAuth, logout, walletChain, walletAddress]);

  const openWalletModal = useCallback(() => {
    setWalletModalOpen(true);
  }, []);

  const smartLogin = useCallback(() => {
    if (authenticated) return;
    login();
  }, [authenticated, login]);

  const value = useMemo<AtelierAuthContextValue>(
    () => ({
      authenticated,
      ready,
      login: smartLogin,
      logout: handleLogout,
      user: user ?? null,
      walletAddress,
      linkedWalletAddresses,
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
      openWalletModal,
      authMode,
      atelierUser,
      refreshAtelierUser,
    }),
    [
      authenticated,
      ready,
      smartLogin,
      handleLogout,
      user,
      walletAddress,
      linkedWalletAddresses,
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
      openWalletModal,
      authMode,
      atelierUser,
      refreshAtelierUser,
    ]
  );

  return (
    <AtelierAuthContext.Provider value={value}>
      {children}
      <WalletAccountModal
        open={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
      />
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
