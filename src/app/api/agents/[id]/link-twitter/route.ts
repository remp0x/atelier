export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAtelierAgentsByUser, updateAtelierAgent, type AtelierAgent } from '@/lib/atelier-db';
import { authenticatePrivyRequest, PrivyAuthError } from '@/lib/privy-auth';

const TWEET_URL_REGEX = /^https?:\/\/(x\.com|twitter\.com)\/[a-zA-Z0-9_]{1,15}\/status\/\d+/;
const AUTHOR_URL_REGEX = /^https?:\/\/(x\.com|twitter\.com)\/([a-zA-Z0-9_]{1,15})$/;

function buildVerificationTweet(name: string, code: string): string {
  return `I'm claiming my AI agent "${name}" on @useAtelier\n\nVerification: ${code}`;
}

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

async function resolveOwnedAgent(request: NextRequest, agentId: string): Promise<AtelierAgent | NextResponse> {
  let privyUserId: string;
  try {
    const privyUser = await authenticatePrivyRequest(request);
    privyUserId = privyUser.privyUserId;
  } catch (e) {
    const status = e instanceof PrivyAuthError ? e.statusCode : 401;
    const message = e instanceof Error ? e.message : 'Authentication required';
    return NextResponse.json({ success: false, error: message }, { status });
  }

  const owned = await getAtelierAgentsByUser(privyUserId);
  const agent = owned.find((a) => a.id === agentId);
  if (!agent) {
    return NextResponse.json({ success: false, error: 'Agent not found or not owned by you' }, { status: 404 });
  }
  return agent;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: agentId } = await params;
  const resolved = await resolveOwnedAgent(request, agentId);
  if (resolved instanceof NextResponse) return resolved;
  const agent = resolved;

  if (agent.twitter_username) {
    return NextResponse.json({
      success: true,
      data: { verified: true, twitter_username: agent.twitter_username },
    });
  }

  if (!agent.twitter_verification_code) {
    return NextResponse.json(
      { success: false, error: 'No verification code on this agent.' },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      verified: false,
      twitter_username: null,
      verification_code: agent.twitter_verification_code,
      verification_tweet: buildVerificationTweet(agent.name, agent.twitter_verification_code),
    },
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: agentId } = await params;
  const resolved = await resolveOwnedAgent(request, agentId);
  if (resolved instanceof NextResponse) return resolved;
  const agent = resolved;

  if (agent.twitter_username) {
    return NextResponse.json(
      { success: false, error: 'X already linked', data: { twitter_username: agent.twitter_username } },
      { status: 409 },
    );
  }

  if (!agent.twitter_verification_code) {
    return NextResponse.json(
      { success: false, error: 'No verification code on this agent.' },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const tweet_url = (body as { tweet_url?: unknown }).tweet_url;
  if (typeof tweet_url !== 'string' || !TWEET_URL_REGEX.test(tweet_url.trim())) {
    return NextResponse.json(
      { success: false, error: 'Invalid tweet URL. Expected: https://x.com/{username}/status/{id}' },
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

  if (!tweetText.includes(agent.twitter_verification_code)) {
    return NextResponse.json(
      { success: false, error: `Tweet does not contain verification code "${agent.twitter_verification_code}"` },
      { status: 400 },
    );
  }

  if (!tweetText.toLowerCase().includes('@useatelier')) {
    return NextResponse.json({ success: false, error: 'Tweet must mention @useAtelier' }, { status: 400 });
  }

  await updateAtelierAgent(agent.id, { twitter_username: twitterUsername });

  return NextResponse.json({ success: true, data: { verified: true, twitter_username: twitterUsername } });
}
