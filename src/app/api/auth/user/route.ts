export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { isAddress, getAddress } from 'viem';
import {
  autoSetAgentBasePayoutForUser,
  generateDefaultUsername,
  getUserByPrivyId,
  isUsernameAvailable,
  setUsername,
  upsertUser,
  type AtelierUser,
} from '@/lib/atelier-db';
import { authenticatePrivyRequest, PrivyAuthError, type PrivyUserInfo } from '@/lib/privy-auth';

async function autoLinkBasePayout(info: PrivyUserInfo): Promise<void> {
  const evm = info.linkedEvmWallets[0];
  if (!evm || !isAddress(evm)) return;
  try {
    await autoSetAgentBasePayoutForUser(info.privyUserId, getAddress(evm));
  } catch (err) {
    console.error('[auth/user] auto-link base payout failed:', err);
  }
}

const USERNAME_SLUG_REGEX = /^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])?$/;
const VERCEL_BLOB_ORIGIN = 'vercel-storage.com';
const TWITTER_CDN_ORIGINS = ['pbs.twimg.com', 'abs.twimg.com'];

const MAX_USERNAME_ATTEMPTS = 99;

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

async function resolveUsername(info: PrivyUserInfo): Promise<string> {
  const base = generateDefaultUsername(info.twitterUsername, info.privyUserId);
  if (await isUsernameAvailable(base)) return base;

  for (let i = 2; i <= MAX_USERNAME_ATTEMPTS; i++) {
    const candidate = `${base}${i}`;
    if (await isUsernameAvailable(candidate)) return candidate;
  }

  return `${base}_${randomSuffix()}`;
}

function isUserUploadedAvatar(url: string | null): boolean {
  return typeof url === 'string' && url.includes('vercel-storage.com');
}

async function buildUserPayload(
  user: AtelierUser,
  isNew: boolean,
): Promise<NextResponse> {
  return NextResponse.json(
    {
      success: true,
      data: { user, wallets: [], is_new: isNew, backfilled: null },
    },
    { headers: { 'Content-Type': 'application/json' } },
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let info: PrivyUserInfo;
  try {
    info = await authenticatePrivyRequest(request);
  } catch (err) {
    if (err instanceof PrivyAuthError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.statusCode, headers: { 'Content-Type': 'application/json' } },
      );
    }
    console.error('[auth/user] POST auth failed:', err);
    return NextResponse.json(
      { success: false, error: 'Authentication failed' },
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const existing = await getUserByPrivyId(info.privyUserId);
    const isNew = existing === null;

    const username = existing?.username ?? (await resolveUsername(info));
    const displayName =
      existing?.display_name ?? info.twitterName ?? info.googleName ?? username;

    const avatarUrl = isUserUploadedAvatar(existing?.avatar_url ?? null)
      ? existing!.avatar_url
      : info.twitterProfilePictureUrl;

    const user = await upsertUser({
      privy_user_id: info.privyUserId,
      username,
      display_name: displayName,
      twitter_username: info.twitterUsername,
      twitter_subject: info.twitterSubject,
      google_email: info.googleEmail,
      google_subject: info.googleSubject,
      email: info.email,
      avatar_url: avatarUrl,
      bio: existing?.bio ?? null,
    });

    await autoLinkBasePayout(info);

    return buildUserPayload(user, isNew);
  } catch (err) {
    console.error('[auth/user] POST upsert failed:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to upsert user' },
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

function isAllowedAvatarUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname;
    if (host.endsWith(VERCEL_BLOB_ORIGIN)) return true;
    if (TWITTER_CDN_ORIGINS.some((o) => host === o || host.endsWith(`.${o}`))) return true;
    return false;
  } catch {
    return false;
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  let info: PrivyUserInfo;
  try {
    info = await authenticatePrivyRequest(request);
  } catch (err) {
    if (err instanceof PrivyAuthError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.statusCode, headers: { 'Content-Type': 'application/json' } },
      );
    }
    console.error('[auth/user] PATCH auth failed:', err);
    return NextResponse.json(
      { success: false, error: 'Authentication failed' },
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const errors: string[] = [];

  let displayName: string | undefined;
  if (body.display_name !== undefined) {
    if (typeof body.display_name !== 'string') {
      errors.push('display_name must be a string');
    } else {
      const v = body.display_name.replace(/[\r\n]/g, '').trim();
      if (v.length > 30) errors.push('display_name must be 30 characters or fewer');
      else displayName = v || undefined;
    }
  }

  let newUsername: string | undefined;
  if (body.username !== undefined) {
    if (typeof body.username !== 'string') {
      errors.push('username must be a string');
    } else {
      const v = body.username.trim().toLowerCase();
      if (v.length < 3 || v.length > 30) {
        errors.push('username must be 3-30 characters');
      } else if (!USERNAME_SLUG_REGEX.test(v)) {
        errors.push('username may only contain lowercase letters, numbers, hyphens, and underscores');
      } else {
        newUsername = v;
      }
    }
  }

  let bio: string | undefined;
  if (body.bio !== undefined) {
    if (typeof body.bio !== 'string') {
      errors.push('bio must be a string');
    } else {
      const v = body.bio.trim();
      if (v.length > 280) errors.push('bio must be 280 characters or fewer');
      else bio = v || undefined;
    }
  }

  let avatarUrl: string | undefined;
  if (body.avatar_url !== undefined) {
    if (typeof body.avatar_url !== 'string') {
      errors.push('avatar_url must be a string');
    } else if (body.avatar_url === '') {
      avatarUrl = undefined;
    } else if (!isAllowedAvatarUrl(body.avatar_url)) {
      errors.push('avatar_url must be a Vercel Blob or Twitter CDN URL');
    } else {
      avatarUrl = body.avatar_url;
    }
  }

  if (errors.length > 0) {
    return NextResponse.json(
      { success: false, error: errors.join('; ') },
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const existing = await getUserByPrivyId(info.privyUserId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (newUsername && newUsername !== existing.username) {
      const available = await isUsernameAvailable(newUsername);
      if (!available) {
        return NextResponse.json(
          { success: false, error: 'Username is already taken' },
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        );
      }
      await setUsername(info.privyUserId, newUsername);
    }

    const user = await upsertUser({
      privy_user_id: info.privyUserId,
      ...(displayName !== undefined ? { display_name: displayName } : {}),
      ...(bio !== undefined ? { bio } : {}),
      ...(avatarUrl !== undefined ? { avatar_url: avatarUrl } : {}),
    });

    return NextResponse.json(
      { success: true, data: { user } },
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[auth/user] PATCH failed:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to update user' },
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  let info: PrivyUserInfo;
  try {
    info = await authenticatePrivyRequest(request);
  } catch (err) {
    if (err instanceof PrivyAuthError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.statusCode, headers: { 'Content-Type': 'application/json' } },
      );
    }
    console.error('[auth/user] GET auth failed:', err);
    return NextResponse.json(
      { success: false, error: 'Authentication failed' },
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const user = await getUserByPrivyId(info.privyUserId);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return buildUserPayload(user, false);
  } catch (err) {
    console.error('[auth/user] GET failed:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to load user' },
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
