export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { registerAtelierAgent, DuplicateAgentError, setSAIDIdentity, type ServiceCategory } from '@/lib/atelier-db';
import { rateLimiters } from '@/lib/rateLimit';
import { getPendingVerification, clearPendingVerification, type PendingPayload } from '@/lib/pending-verifications';
import { validateExternalUrl } from '@/lib/url-validation';
import { createSAIDAgent } from '@/lib/said';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://atelierai.xyz';

const TWEET_URL_REGEX = /^https?:\/\/(x\.com|twitter\.com)\/[a-zA-Z0-9_]{1,15}\/status\/\d+/;
const AUTHOR_URL_REGEX = /^https?:\/\/(x\.com|twitter\.com)\/([a-zA-Z0-9_]{1,15})$/;

const VALID_CAPABILITIES: ServiceCategory[] = ['image_gen', 'video_gen', 'ugc', 'influencer', 'brand_content', 'coding', 'analytics', 'seo', 'trading', 'automation', 'consulting', 'custom'];
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const PROTOCOL_SPEC = {
  required_endpoints: [
    'GET  /agent/profile    -> { name, description, avatar_url, capabilities[] }',
    'GET  /agent/services   -> { services: [{ id, title, description, price_usd, category }] }',
    'POST /agent/execute    -> { service_id, brief, params } -> { result, deliverable_url }',
    'GET  /agent/portfolio  -> { works: [{ url, type, caption, created_at }] }',
  ],
};

async function fetchTweetOembed(tweetUrl: string): Promise<{ text: string; username: string }> {
  const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(tweetUrl)}&omit_script=true`;
  const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    throw new Error(`Failed to fetch tweet (${res.status}). Make sure the tweet is public.`);
  }
  const data = await res.json();
  const html: string = data.html || '';
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

  const authorUrl: string = data.author_url || '';
  const authorMatch = authorUrl.match(AUTHOR_URL_REGEX);
  if (!authorMatch) {
    throw new Error('Could not determine tweet author from response.');
  }

  return { text, username: authorMatch[2] };
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = rateLimiters.registration(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const { session_token, tweet_url } = body;

    if (!session_token || typeof session_token !== 'string') {
      return NextResponse.json(
        { success: false, error: 'session_token is required. Call POST /api/agents/pre-verify first.' },
        { status: 400 },
      );
    }

    if (!tweet_url || typeof tweet_url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'tweet_url is required' },
        { status: 400 },
      );
    }

    if (!TWEET_URL_REGEX.test(tweet_url.trim())) {
      return NextResponse.json(
        { success: false, error: 'Invalid tweet URL. Expected: https://x.com/{username}/status/{id}' },
        { status: 400 },
      );
    }

    const pending = await getPendingVerification(session_token);
    if (!pending) {
      return NextResponse.json(
        { success: false, error: 'Verification session expired or not found. Call POST /api/agents/pre-verify to start over.' },
        { status: 400 },
      );
    }

    let tweetText: string;
    let twitterUsername: string;
    try {
      const oembed = await fetchTweetOembed(tweet_url.trim());
      tweetText = oembed.text;
      twitterUsername = oembed.username;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to fetch tweet';
      return NextResponse.json({ success: false, error: msg }, { status: 422 });
    }

    if (!tweetText.includes(pending.code)) {
      return NextResponse.json(
        { success: false, error: `Tweet does not contain verification code "${pending.code}"` },
        { status: 400 },
      );
    }

    if (!tweetText.toLowerCase().includes('@useatelier')) {
      return NextResponse.json(
        { success: false, error: 'Tweet must mention @useAtelier' },
        { status: 400 },
      );
    }

    const stored: Partial<PendingPayload> = pending.payload || {};
    const name = pending.name;
    const description = body.description || stored.description;
    const avatar_url = body.avatar_url ?? stored.avatar_url;
    const endpoint_url = body.endpoint_url ?? stored.endpoint_url;
    const capabilities = body.capabilities ?? stored.capabilities ?? [];
    const ai_models = body.ai_models ?? stored.ai_models;
    const owner_wallet = body.owner_wallet ?? stored.owner_wallet;

    if (!description || typeof description !== 'string' || description.length < 10 || description.length > 500) {
      return NextResponse.json(
        { success: false, error: 'description is required (10-500 characters). Pass it here or in pre-verify.' },
        { status: 400 },
      );
    }

    if (endpoint_url) {
      const check = validateExternalUrl(endpoint_url);
      if (!check.valid) {
        return NextResponse.json({ success: false, error: `Invalid endpoint_url: ${check.error}` }, { status: 400 });
      }
    }

    if (owner_wallet && !BASE58_REGEX.test(owner_wallet)) {
      return NextResponse.json({ success: false, error: 'owner_wallet must be a valid base58 Solana address' }, { status: 400 });
    }

    if (Array.isArray(capabilities)) {
      const invalid = capabilities.filter((c: string) => !VALID_CAPABILITIES.includes(c as ServiceCategory));
      if (invalid.length > 0) {
        return NextResponse.json(
          { success: false, error: `Invalid capabilities: ${invalid.join(', ')}` },
          { status: 400 },
        );
      }
    }

    const result = await registerAtelierAgent({
      name,
      description,
      avatar_url,
      endpoint_url,
      capabilities: capabilities || [],
      ai_models,
      owner_wallet,
      twitter_verification_code: pending.code,
      twitter_username: twitterUsername,
    });

    await clearPendingVerification(session_token);

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

    return NextResponse.json({
      success: true,
      data: {
        agent_id: result.agent_id,
        slug: result.slug,
        api_key: result.api_key,
        webhook_secret: result.webhook_secret,
        twitter_username: twitterUsername,
        protocol_spec: PROTOCOL_SPEC,
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateAgentError) {
      const existing = error.existingAgent;
      const maskedKey = existing.api_key
        ? `atelier_...${existing.api_key.slice(-4)}`
        : null;
      return NextResponse.json({
        success: false,
        error: 'duplicate_agent',
        message: `An agent named "${existing.name}" was registered recently. If this is yours, recover it instead of re-registering.`,
        existing_agent: {
          agent_id: existing.id,
          slug: existing.slug,
          name: existing.name,
          created_at: existing.created_at,
          api_key_hint: maskedKey,
        },
        recovery: 'POST /api/agents/recover with wallet signature or X login to retrieve your API key.',
      }, { status: 409 });
    }

    console.error('Atelier agent registration error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
