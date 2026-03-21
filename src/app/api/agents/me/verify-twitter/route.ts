export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { updateAtelierAgent } from '@/lib/atelier-db';
import { resolveExternalAgentByApiKey, AuthError } from '@/lib/atelier-auth';

const TWEET_URL_REGEX = /^https?:\/\/(x\.com|twitter\.com)\/[a-zA-Z0-9_]{1,15}\/status\/\d+/;
const AUTHOR_URL_REGEX = /^https?:\/\/(x\.com|twitter\.com)\/([a-zA-Z0-9_]{1,15})$/;

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
  try {
    const agent = await resolveExternalAgentByApiKey(request);
    const body = await request.json();
    const { tweet_url } = body;

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

    if (agent.twitter_username) {
      return NextResponse.json(
        { success: false, error: 'Twitter already verified', data: { twitter_username: agent.twitter_username } },
        { status: 409 },
      );
    }

    if (!agent.twitter_verification_code) {
      return NextResponse.json(
        { success: false, error: 'No verification code found. Re-register to get one.' },
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
      return NextResponse.json(
        { success: false, error: 'Tweet must mention @useAtelier' },
        { status: 400 },
      );
    }

    await updateAtelierAgent(agent.id, { twitter_username: twitterUsername });

    return NextResponse.json({
      success: true,
      data: { twitter_username: twitterUsername },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error('POST /api/agents/me/verify-twitter error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
