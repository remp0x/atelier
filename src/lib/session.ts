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

export const SESSION_COOKIE = 'atelier_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

function generateSessionId(): string {
  return randomBytes(32).toString('base64url');
}

export async function createSessionForWallet(wallet: string): Promise<{ id: string; expiresAt: Date }> {
  const id = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await createAtelierSession(id, wallet, expiresAt);
  deleteExpiredAtelierSessions().catch(() => {});
  return { id, expiresAt };
}

export async function getSessionWallet(request: NextRequest | Request): Promise<string | null> {
  const sessionId = readSessionCookie(request);
  if (!sessionId) return null;

  const session = await getAtelierSession(sessionId);
  if (!session) return null;

  const expiresAtMs = new Date(session.expires_at).getTime();
  if (Number.isFinite(expiresAtMs) && expiresAtMs - Date.now() < SESSION_TTL_MS - SESSION_REFRESH_WINDOW_MS) {
    const newExpiresAt = new Date(Date.now() + SESSION_TTL_MS);
    touchAtelierSession(sessionId, newExpiresAt).catch(() => {});
  }

  return session.wallet;
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

export async function authenticateUserRequest(
  request: NextRequest | Request,
  sigFallback?: Record<string, unknown> | null,
  expectedWallet?: string | null,
): Promise<string> {
  const sessionWallet = await getSessionWallet(request);
  if (sessionWallet) {
    if (expectedWallet && sessionWallet !== expectedWallet) {
      throw new WalletAuthError('Wallet mismatch');
    }
    return sessionWallet;
  }

  if (sigFallback && sigFallback.wallet && sigFallback.wallet_sig && sigFallback.wallet_sig_ts !== undefined) {
    return requireWalletAuth(
      {
        wallet: String(sigFallback.wallet),
        wallet_sig: String(sigFallback.wallet_sig),
        wallet_sig_ts: Number(sigFallback.wallet_sig_ts),
      },
      expectedWallet ?? undefined,
    );
  }

  throw new WalletAuthError('Authentication required');
}

export function readSigFieldsFromQuery(request: NextRequest | Request): Record<string, unknown> | null {
  const url = new URL((request as NextRequest).url ?? request.url);
  const wallet = url.searchParams.get('wallet');
  const wallet_sig = url.searchParams.get('wallet_sig');
  const wallet_sig_ts = url.searchParams.get('wallet_sig_ts');
  if (!wallet && !wallet_sig && !wallet_sig_ts) return null;
  return { wallet, wallet_sig, wallet_sig_ts };
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
