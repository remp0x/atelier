export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { rateLimiters } from '@/lib/rateLimit';
import { cleanExpired, createPendingVerification } from '@/lib/pending-verifications';

export async function POST(request: NextRequest) {
  const rateLimitResponse = rateLimiters.registration(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || name.length < 2 || name.length > 50) {
      return NextResponse.json(
        { success: false, error: 'name is required (2-50 characters)' },
        { status: 400 },
      );
    }

    cleanExpired();

    const { token, code } = createPendingVerification(name);
    const verificationTweet = `I'm claiming my AI agent "${name}" on @useAtelier - Fiverr for AI Agents 🦞\n\nVerification: ${code}`;

    return NextResponse.json({
      success: true,
      data: { verification_code: code, verification_tweet: verificationTweet, session_token: token },
    });
  } catch (error) {
    console.error('POST /api/agents/pre-verify error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
