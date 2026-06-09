import { randomBytes } from 'crypto';
import type { NextRequest } from 'next/server';
import {
  createAtelierSession,
  getAtelierSession,
  touchAtelierSession,
  deleteAtelierSession,
  deleteExpiredAtelierSessions,
} from './atelier-db';
import { requireWalletAuth, WalletAuthError } from './solana-auth';
import { authenticateEvmRequest, EvmAuthError } from './evm-auth';
import { detectWalletChain, type WalletChain, WalletAuthError as ChainWalletAuthError } from './wallet-auth';

export { ChainWalletAuthError };
export type { WalletChain };

export const SESSION_COOKIE = 'atelier_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

function generateSessionId(): string {
  return randomBytes(32).toString('base64url');
}

export async function createSessionForWallet(
  wallet: string,
  walletChain: WalletChain = 'solana',
): Promise<{ id: string; expiresAt: Date; chain: WalletChain }> {
  const id = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await createAtelierSession(id, wallet, expiresAt, walletChain);
  deleteExpiredAtelierSessions().catch(() => {});
  return { id, expiresAt, chain: walletChain };
}

export async function getSessionAuth(
  request: NextRequest | Request,
): Promise<{ wallet: string; chain: WalletChain } | null> {
  const sessionId = readSessionCookie(request);
  if (!sessionId) return null;

  const session = await getAtelierSession(sessionId);
  if (!session) return null;

  const expiresAtMs = new Date(session.expires_at).getTime();
  if (Number.isFinite(expiresAtMs) && expiresAtMs - Date.now() < SESSION_TTL_MS - SESSION_REFRESH_WINDOW_MS) {
    const newExpiresAt = new Date(Date.now() + SESSION_TTL_MS);
    touchAtelierSession(sessionId, newExpiresAt).catch(() => {});
  }

  const chain: WalletChain = session.wallet_chain === 'base' ? 'base' : 'solana';
  return { wallet: session.wallet, chain };
}

export async function getSessionWallet(request: NextRequest | Request): Promise<string | null> {
  const auth = await getSessionAuth(request);
  return auth?.wallet ?? null;
}

export async function destroySession(request: NextRequest | Request): Promise<void> {
  const sessionId = readSessionCookie(request);
  if (!sessionId) return;
  await deleteAtelierSession(sessionId);
}

function readSessionCookie(request: NextRequest | Request): string | null {
  const nextReq = request as NextRequest;
  if (nextReq.cookies && typeof nextReq.cookies.get === 'function') {
    return nextReq.cookies.get(SESSION_COOKIE)?.value ?? null;
  }
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function buildSessionCookie(sessionId: string, expiresAt: Date): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const attrs = [
    `${SESSION_COOKIE}=${sessionId}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (process.env.NODE_ENV === 'production') attrs.push('Secure');
  return attrs.join('; ');
}

function readChainHint(
  request: NextRequest | Request,
  body: Record<string, unknown> | null | undefined,
): WalletChain | null {
  const fromBody = body?.wallet_chain;
  if (typeof fromBody === 'string') {
    const normalized = fromBody.toLowerCase();
    if (normalized === 'solana' || normalized === 'base') return normalized;
  }
  const fromHeader = request.headers.get('x-atelier-wallet-chain');
  if (fromHeader) {
    const normalized = fromHeader.toLowerCase();
    if (normalized === 'solana' || normalized === 'base') return normalized;
  }
  return null;
}

async function verifySignatureFallback(
  request: NextRequest | Request,
  sigFallback: Record<string, unknown>,
  expectedWallet: string | null,
): Promise<{ wallet: string; chain: WalletChain }> {
  const walletField = typeof sigFallback.wallet === 'string' ? sigFallback.wallet : undefined;
  const hinted = readChainHint(request, sigFallback);
  const inferred = walletField ? detectWalletChain(walletField) : null;
  const chain: WalletChain = hinted ?? inferred ?? 'solana';

  try {
    if (chain === 'base') {
      const address = await authenticateEvmRequest(request, sigFallback, expectedWallet ?? undefined);
      return { wallet: address, chain };
    }

    if (!walletField || !sigFallback.wallet_sig || sigFallback.wallet_sig_ts === undefined) {
      throw new WalletAuthError('wallet, wallet_sig, and wallet_sig_ts are required');
    }

    const verified = requireWalletAuth(
      {
        wallet: walletField,
        wallet_sig: String(sigFallback.wallet_sig),
        wallet_sig_ts: Number(sigFallback.wallet_sig_ts),
      },
      expectedWallet ?? undefined,
    );
    return { wallet: verified, chain: 'solana' };
  } catch (err) {
    if (err instanceof EvmAuthError) {
      throw new ChainWalletAuthError(err.message, { cause: err, chain });
    }
    throw err;
  }
}

export async function authenticateUserRequest(
  request: NextRequest | Request,
  sigFallback?: Record<string, unknown> | null,
  expectedWallet?: string | null,
): Promise<string> {
  const result = await authenticateUserRequestWithChain(request, sigFallback ?? null, expectedWallet ?? null);
  return result.wallet;
}

export async function authenticateUserRequestWithChain(
  request: NextRequest | Request,
  sigFallback?: Record<string, unknown> | null,
  expectedWallet?: string | null,
): Promise<{ wallet: string; chain: WalletChain }> {
  // A wallet signature is the strongest proof of control and works across multi-wallet users.
  // Privy-authenticated users may carry an old wallet-session cookie tied to a different
  // chain than the wallet they want to act with; we trust the sig when it's present.
  const hasSig =
    sigFallback &&
    sigFallback.wallet &&
    sigFallback.wallet_sig &&
    sigFallback.wallet_sig_ts !== undefined;

  if (hasSig) {
    return verifySignatureFallback(request, sigFallback, expectedWallet ?? null);
  }

  const sessionAuth = await getSessionAuth(request);
  if (sessionAuth) {
    if (expectedWallet && sessionAuth.wallet !== expectedWallet) {
      throw new WalletAuthError('Wallet mismatch');
    }
    return sessionAuth;
  }

  throw new WalletAuthError('Authentication required');
}

// Reads wallet-signature auth fields. Headers are preferred so the signature
// never lands in URLs (and therefore not in CDN/proxy access logs, browser
// history, or Referer headers); the query-string form is still accepted for
// backward compatibility with existing agent/external callers.
export function readSigFieldsFromQuery(request: NextRequest | Request): Record<string, unknown> | null {
  const h = request.headers;
  const hWallet = h.get('x-atelier-wallet');
  const hSig = h.get('x-atelier-wallet-sig');
  const hTs = h.get('x-atelier-wallet-sig-ts');
  if (hWallet || hSig || hTs) {
    const fields: Record<string, unknown> = { wallet: hWallet, wallet_sig: hSig, wallet_sig_ts: hTs };
    const hChain = h.get('x-atelier-wallet-chain');
    if (hChain) fields.wallet_chain = hChain;
    return fields;
  }

  const url = new URL((request as NextRequest).url ?? request.url);
  const wallet = url.searchParams.get('wallet');
  const wallet_sig = url.searchParams.get('wallet_sig');
  const wallet_sig_ts = url.searchParams.get('wallet_sig_ts');
  const wallet_chain = url.searchParams.get('wallet_chain');
  if (!wallet && !wallet_sig && !wallet_sig_ts) return null;
  const fields: Record<string, unknown> = { wallet, wallet_sig, wallet_sig_ts };
  if (wallet_chain) fields.wallet_chain = wallet_chain;
  return fields;
}

export function buildClearedSessionCookie(): string {
  const attrs = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (process.env.NODE_ENV === 'production') attrs.push('Secure');
  return attrs.join('; ');
}
