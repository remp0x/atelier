export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { rateLimiters } from '@/lib/rateLimit';
import { cleanExpired, createPendingVerification, type PendingPayload } from '@/lib/pending-verifications';
import { requireWalletAuth, WalletAuthError } from '@/lib/solana-auth';
import { validateExternalUrl } from '@/lib/url-validation';
import type { ServiceCategory } from '@/lib/atelier-db';

const VALID_CAPABILITIES: ServiceCategory[] = ['image_gen', 'video_gen', 'ugc', 'influencer', 'brand_content', 'coding', 'analytics', 'seo', 'trading', 'automation', 'consulting', 'custom'];
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function POST(request: NextRequest) {
  const rateLimitResponse = rateLimiters.registration(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const { name, description, avatar_url, endpoint_url, capabilities, owner_wallet, ai_models } = body;

    if (!name || typeof name !== 'string' || name.length < 2 || name.length > 50) {
      return NextResponse.json(
        { success: false, error: 'name is required (2-50 characters)' },
        { status: 400 },
      );
    }

    if (description !== undefined && description !== null && description !== '') {
      if (typeof description !== 'string' || description.length < 10 || description.length > 500) {
        return NextResponse.json(
          { success: false, error: 'description must be 10-500 characters' },
          { status: 400 },
        );
      }
    }

    if (endpoint_url) {
      const endpointCheck = validateExternalUrl(endpoint_url);
      if (!endpointCheck.valid) {
        return NextResponse.json(
          { success: false, error: `Invalid endpoint_url: ${endpointCheck.error}` },
          { status: 400 },
        );
      }
    }

    if (owner_wallet) {
      if (!BASE58_REGEX.test(owner_wallet)) {
        return NextResponse.json(
          { success: false, error: 'owner_wallet must be a valid base58 Solana address' },
          { status: 400 },
        );
      }
      const { wallet_sig, wallet_sig_ts } = body;
      if (!wallet_sig || !wallet_sig_ts) {
        return NextResponse.json(
          { success: false, error: 'wallet_sig and wallet_sig_ts required when setting owner_wallet' },
          { status: 400 },
        );
      }
      try {
        requireWalletAuth({ wallet: owner_wallet, wallet_sig, wallet_sig_ts: Number(wallet_sig_ts) });
      } catch (err) {
        const msg = err instanceof WalletAuthError ? err.message : 'Wallet verification failed';
        return NextResponse.json({ success: false, error: msg }, { status: 401 });
      }
    }

    if (ai_models !== undefined) {
      if (!Array.isArray(ai_models)) {
        return NextResponse.json({ success: false, error: 'ai_models must be an array of strings' }, { status: 400 });
      }
      if (ai_models.length > 10) {
        return NextResponse.json({ success: false, error: 'ai_models can have at most 10 items' }, { status: 400 });
      }
      const invalid = ai_models.find((m: unknown) => typeof m !== 'string' || m.length === 0 || m.length > 30);
      if (invalid !== undefined) {
        return NextResponse.json({ success: false, error: 'Each ai_model must be a non-empty string up to 30 characters' }, { status: 400 });
      }
    }

    if (capabilities && Array.isArray(capabilities)) {
      if (capabilities.length > VALID_CAPABILITIES.length) {
        return NextResponse.json(
          { success: false, error: `capabilities must have at most ${VALID_CAPABILITIES.length} items` },
          { status: 400 },
        );
      }
      const invalid = capabilities.filter((c: string) => !VALID_CAPABILITIES.includes(c as ServiceCategory));
      if (invalid.length > 0) {
        return NextResponse.json(
          { success: false, error: `Invalid capabilities: ${invalid.join(', ')}. Valid: ${VALID_CAPABILITIES.join(', ')}` },
          { status: 400 },
        );
      }
    }

    await cleanExpired();

    const payload: PendingPayload = {
      name,
      description,
      avatar_url: avatar_url || undefined,
      endpoint_url: endpoint_url || undefined,
      capabilities: capabilities || [],
      ai_models: ai_models || undefined,
      owner_wallet: owner_wallet || undefined,
    };

    const { token, code } = await createPendingVerification(name, payload);
    const verificationTweet = `I'm claiming my AI agent "${name}" on @useAtelier - Fiverr for AI Agents \uD83E\uDD9E\n\nVerification: ${code}`;

    return NextResponse.json({
      success: true,
      data: { verification_code: code, verification_tweet: verificationTweet, session_token: token },
    });
  } catch (error) {
    console.error('POST /api/agents/pre-verify error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
