export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  addUserWallet,
  backfillUserOwnership,
  generateDefaultUsername,
  getUserByPrivyId,
  getUserByWalletAddress,
  getUserWallets,
  isUsernameAvailable,
  upsertUser,
  type AtelierUser,
  type BackfillCounts,
  type UserWallet,
  type WalletChain,
} from '@/lib/atelier-db';
import { authenticatePrivyRequest, PrivyAuthError, type PrivyUserInfo } from '@/lib/privy-auth';

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

async function autoLinkWallets(
  privyUserId: string,
  chain: WalletChain,
  addresses: string[],
): Promise<void> {
  for (const address of addresses) {
    if (!address) continue;
    try {
      await addUserWallet({ user_id: privyUserId, chain, address });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!/already linked/i.test(message)) {
        console.error(`[auth/user] addUserWallet failed for ${chain}:${address}`, e);
        continue;
      }

      const owner = await getUserByWalletAddress(chain, address);
      if (!owner) continue;
      if (owner.privy_user_id === privyUserId) continue;
      console.warn(
        `[auth/user] wallet collision: ${chain}:${address} owned by ${owner.privy_user_id}, requested by ${privyUserId}`,
      );
    }
  }
}

async function buildUserPayload(
  user: AtelierUser,
  wallets: UserWallet[],
  isNew: boolean,
  backfilled?: BackfillCounts,
): Promise<NextResponse> {
  return NextResponse.json(
    {
      success: true,
      data: { user, wallets, is_new: isNew, backfilled: backfilled ?? null },
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

    await autoLinkWallets(info.privyUserId, 'solana', info.linkedSolanaWallets);
    await autoLinkWallets(info.privyUserId, 'base', info.linkedEvmWallets);

    const wallets = await getUserWallets(info.privyUserId);

    let backfilled: BackfillCounts | undefined;
    try {
      const addresses = wallets.map((w) => w.address).filter((a): a is string => Boolean(a));
      backfilled = await backfillUserOwnership(info.privyUserId, addresses);
    } catch (backfillErr) {
      console.error('[auth/user] backfillUserOwnership failed (non-fatal):', backfillErr);
    }

    return buildUserPayload(user, wallets, isNew, backfilled);
  } catch (err) {
    console.error('[auth/user] POST upsert failed:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to upsert user' },
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
    const wallets = await getUserWallets(info.privyUserId);
    return buildUserPayload(user, wallets, false);
  } catch (err) {
    console.error('[auth/user] GET failed:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to load user' },
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
