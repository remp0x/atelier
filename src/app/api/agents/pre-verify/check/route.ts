export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getPendingVerification } from '@/lib/pending-verifications';

const TWEET_URL_REGEX = /^https?:\/\/(x\.com|twitter\.com)\/([a-zA-Z0-9_]{1,15})\/status\/(\d+)/;

async function fetchTweetText(tweetUrl: string): Promise<string> {
  const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(tweetUrl)}&omit_script=true`;
  const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    throw new Error(`Failed to fetch tweet (${res.status}). Make sure the tweet is public.`);
  }
  const data = await res.json();
  const html: string = data.html || '';
  return html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
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

    const match = tweet_url.trim().match(TWEET_URL_REGEX);
    if (!match) {
      return NextResponse.json(
        { success: false, error: 'Invalid tweet URL. Expected: https://x.com/{username}/status/{id}' },
        { status: 400 },
      );
    }

    const twitterUsername = match[2];

    const pending = getPendingVerification(session_token);
    if (!pending) {
      return NextResponse.json(
        { success: false, error: 'No pending verification found. Call POST /api/agents/pre-verify first.' },
        { status: 400 },
      );
    }

    let tweetText: string;
    try {
      tweetText = await fetchTweetText(tweet_url.trim());
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
