export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { registerAtelierAgent, setSAIDIdentity, type ServiceCategory } from '@/lib/atelier-db';
import { requireWalletAuth, WalletAuthError } from '@/lib/solana-auth';
import { rateLimiters } from '@/lib/rateLimit';
import { validateExternalUrl } from '@/lib/url-validation';
import { createSAIDAgent } from '@/lib/said';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://atelierai.xyz';

const VALID_CAPABILITIES: ServiceCategory[] = ['image_gen', 'video_gen', 'ugc', 'influencer', 'brand_content', 'coding', 'analytics', 'seo', 'trading', 'automation', 'consulting', 'custom'];

const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const PROTOCOL_SPEC = {
  required_endpoints: [
    'GET  /agent/profile    → { name, description, avatar_url, capabilities[] }',
    'GET  /agent/services   → { services: [{ id, title, description, price_usd, category }] }',
    'POST /agent/execute    → { service_id, brief, params } → { result, deliverable_url }',
    'GET  /agent/portfolio  → { works: [{ url, type, caption, created_at }] }',
  ],
};

export async function POST(request: NextRequest) {
  const rateLimitResponse = rateLimiters.registration(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const { name, description, avatar_url, endpoint_url, capabilities, owner_wallet } = body;

    if (!name || !description) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: name, description' },
        { status: 400 }
      );
    }

    if (name.length < 2 || name.length > 50) {
      return NextResponse.json(
        { success: false, error: 'Name must be between 2 and 50 characters' },
        { status: 400 }
      );
    }

    if (description.length < 10 || description.length > 500) {
      return NextResponse.json(
        { success: false, error: 'Description must be between 10 and 500 characters' },
        { status: 400 }
      );
    }

    if (endpoint_url) {
      const endpointCheck = validateExternalUrl(endpoint_url);
      if (!endpointCheck.valid) {
        return NextResponse.json(
          { success: false, error: `Invalid endpoint_url: ${endpointCheck.error}` },
          { status: 400 }
        );
      }
    }

    if (owner_wallet) {
      if (!BASE58_REGEX.test(owner_wallet)) {
        return NextResponse.json(
          { success: false, error: 'owner_wallet must be a valid base58 Solana address' },
          { status: 400 }
        );
      }
      const { wallet_sig, wallet_sig_ts } = body;
      if (!wallet_sig || !wallet_sig_ts) {
        return NextResponse.json(
          { success: false, error: 'wallet_sig and wallet_sig_ts required when setting owner_wallet' },
          { status: 400 }
        );
      }
      try {
        requireWalletAuth({ wallet: owner_wallet, wallet_sig, wallet_sig_ts: Number(wallet_sig_ts) });
      } catch (err) {
        const msg = err instanceof WalletAuthError ? err.message : 'Wallet verification failed';
        return NextResponse.json({ success: false, error: msg }, { status: 401 });
      }
    }

    const { ai_models } = body;
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
          { status: 400 }
        );
      }
      const invalid = capabilities.filter((c: string) => !VALID_CAPABILITIES.includes(c as ServiceCategory));
      if (invalid.length > 0) {
        return NextResponse.json(
          { success: false, error: `Invalid capabilities: ${invalid.join(', ')}. Valid: ${VALID_CAPABILITIES.join(', ')}` },
          { status: 400 }
        );
      }
    }

    const result = await registerAtelierAgent({
      name,
      description,
      avatar_url,
      endpoint_url,
      capabilities: capabilities || [],
      ai_models: ai_models || undefined,
      owner_wallet: owner_wallet || undefined,
      twitter_verification_code: body.twitter_verification_code || undefined,
      twitter_username: body.twitter_username || undefined,
    });

    createSAIDAgent(result.agent_id, `${BASE_URL}/api/said/card/${result.agent_id}`)
      .then(async (said) => {
        await setSAIDIdentity(result.agent_id, {
          wallet: said.walletAddress,
          pda: said.agentPDA,
          secretKey: said.secretKey,
          txHash: said.txSignature,
        });
      })
      .catch((err) => console.error(`SAID registration failed for ${result.agent_id}:`, err));

    const verificationTweet = `I'm claiming my AI agent "${name}" on @useAtelier - Fiverr for AI Agents 🦞\n\nVerification: ${result.twitter_verification_code}`;

    return NextResponse.json({
      success: true,
      data: {
        agent_id: result.agent_id,
        slug: result.slug,
        api_key: result.api_key,
        verification_code: result.twitter_verification_code,
        verification_tweet: verificationTweet,
        protocol_spec: PROTOCOL_SPEC,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Atelier agent registration error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
