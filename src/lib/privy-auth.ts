import type { LinkedAccount } from '@privy-io/node';
import { getPrivyServer } from '@/lib/privy-server';

export class PrivyAuthError extends Error {
  constructor(message: string, public statusCode: number = 401) {
    super(message);
    this.name = 'PrivyAuthError';
  }
}

export interface PrivyUserInfo {
  privyUserId: string;
  twitterUsername: string | null;
  twitterSubject: string | null;
  twitterName: string | null;
  twitterProfilePictureUrl: string | null;
  googleEmail: string | null;
  googleSubject: string | null;
  googleName: string | null;
  email: string | null;
  linkedSolanaWallets: string[];
  linkedEvmWallets: string[];
  raw: unknown;
}

const PRIVY_COOKIE_NAME = 'privy-token';

function isTwitterAccount(
  a: LinkedAccount,
): a is Extract<LinkedAccount, { type: 'twitter_oauth' }> {
  return a.type === 'twitter_oauth';
}

function isGoogleAccount(
  a: LinkedAccount,
): a is Extract<LinkedAccount, { type: 'google_oauth' }> {
  return a.type === 'google_oauth';
}

function isEmailAccount(
  a: LinkedAccount,
): a is Extract<LinkedAccount, { type: 'email' }> {
  return a.type === 'email';
}

function isExternalWallet(a: LinkedAccount): boolean {
  // Privy embedded (custodial) wallets carry connector_type='embedded' or wallet_client_type='privy'.
  // We only auto-link external wallets the user actually controls.
  if (!('connector_type' in a) && !('wallet_client_type' in a)) return true;
  const connector = (a as { connector_type?: string }).connector_type;
  const client = (a as { wallet_client_type?: string }).wallet_client_type;
  if (connector === 'embedded') return false;
  if (client === 'privy') return false;
  return true;
}

function isSolanaWallet(
  a: LinkedAccount,
): a is Extract<LinkedAccount, { type: 'wallet'; chain_type: 'solana' }> {
  return a.type === 'wallet' && 'chain_type' in a && a.chain_type === 'solana' && isExternalWallet(a);
}

function isEvmWallet(
  a: LinkedAccount,
): a is Extract<LinkedAccount, { type: 'wallet'; chain_type: 'ethereum' }> {
  return a.type === 'wallet' && 'chain_type' in a && a.chain_type === 'ethereum' && isExternalWallet(a);
}

function normalizeTwitterUsername(username: string | null): string | null {
  if (!username) return null;
  const trimmed = username.trim().replace(/^@+/, '').toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function parseCookieHeader(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) {
      const value = part.slice(idx + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return null;
}

export async function verifyPrivyAccessToken(accessToken: string): Promise<PrivyUserInfo> {
  if (!accessToken || typeof accessToken !== 'string') {
    throw new PrivyAuthError('Privy access token is required', 401);
  }

  let privy: ReturnType<typeof getPrivyServer>;
  try {
    privy = getPrivyServer();
  } catch {
    throw new PrivyAuthError('Privy server not configured', 503);
  }

  let userId: string;
  try {
    const verified = await privy.utils().auth().verifyAccessToken(accessToken);
    userId = verified.user_id;
  } catch {
    throw new PrivyAuthError('Invalid or expired Privy token', 401);
  }

  let user: Awaited<ReturnType<ReturnType<typeof privy.users>['_get']>>;
  try {
    user = await privy.users()._get(userId);
  } catch {
    throw new PrivyAuthError('Privy user lookup failed', 502);
  }

  const accounts: LinkedAccount[] = user.linked_accounts ?? [];

  const twitter = accounts.find(isTwitterAccount) ?? null;
  const google = accounts.find(isGoogleAccount) ?? null;
  const primaryEmailAccount = accounts.find(isEmailAccount) ?? null;

  const linkedSolanaWallets: string[] = [];
  const linkedEvmWallets: string[] = [];

  for (const account of accounts) {
    if (isSolanaWallet(account) && account.address) {
      linkedSolanaWallets.push(account.address);
    } else if (isEvmWallet(account) && account.address) {
      linkedEvmWallets.push(account.address.toLowerCase());
    }
  }

  const twitterUsername = normalizeTwitterUsername(twitter?.username ?? null);
  const googleEmail = google?.email ?? null;
  const email = primaryEmailAccount?.address ?? googleEmail;

  return {
    privyUserId: userId,
    twitterUsername,
    twitterSubject: twitter?.subject ?? null,
    twitterName: twitter?.name ?? null,
    twitterProfilePictureUrl: twitter?.profile_picture_url ?? null,
    googleEmail,
    googleSubject: google?.subject ?? null,
    googleName: google?.name ?? null,
    email,
    linkedSolanaWallets,
    linkedEvmWallets,
    raw: user,
  };
}

export function readPrivyAccessToken(
  request: Request,
  body?: Record<string, unknown> | null,
): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const trimmed = authHeader.trim();
    if (/^Bearer\s+/i.test(trimmed)) {
      const token = trimmed.replace(/^Bearer\s+/i, '').trim();
      if (token.length > 0 && !token.startsWith('atelier_')) {
        return token;
      }
    }
  }

  const cookieToken = parseCookieHeader(request.headers.get('cookie'), PRIVY_COOKIE_NAME);
  if (cookieToken && cookieToken.length > 0) {
    return cookieToken;
  }

  if (body && typeof body === 'object') {
    const candidate = body.privy_access_token;
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }

  return null;
}

export async function authenticatePrivyRequest(
  request: Request,
  body?: Record<string, unknown> | null,
): Promise<PrivyUserInfo> {
  const token = readPrivyAccessToken(request, body);
  if (!token) {
    throw new PrivyAuthError('Authentication required', 401);
  }
  return verifyPrivyAccessToken(token);
}
