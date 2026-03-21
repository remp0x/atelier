export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getPendingVerification } from '@/lib/pending-verifications';

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
    const body = await request.json();
    const { tweet_url, session_token } = body;

    if (!session_token || typeof session_token !== 'string') {
      return NextResponse.json(
        { success: false, error: 'session_token is required' },
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
        { success: false, error: 'No pending verification found. Call POST /api/agents/pre-verify first.' },
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

    return NextResponse.json({
      success: true,
      data: { twitter_username: twitterUsername, verification_code: pending.code },
    });
  } catch (error) {
    console.error('POST /api/agents/pre-verify/check error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
