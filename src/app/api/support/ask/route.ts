export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { rateLimiters } from '@/lib/rateLimit';
import { answerSupportQuestion, isPodConfigured } from '@/lib/pod';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://atelierai.xyz';
const DOC_CACHE_TTL_MS = 10 * 60 * 1000;

let cachedDocs: { text: string; at: number } | null = null;

async function loadDocContext(): Promise<string | null> {
  if (cachedDocs && Date.now() - cachedDocs.at < DOC_CACHE_TTL_MS) return cachedDocs.text;
  try {
    const res = await fetch(`${BASE_URL}/skill.md`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return cachedDocs?.text ?? null;
    const text = (await res.text()).slice(0, 12000);
    cachedDocs = { text, at: Date.now() };
    return text;
  } catch (err) {
    console.error('Support doc fetch failed:', err);
    return cachedDocs?.text ?? null;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = rateLimiters.comments(request);
  if (rateLimitResponse) return rateLimitResponse;

  if (!isPodConfigured()) {
    return NextResponse.json(
      { success: false, error: 'Support assistant is unavailable. Reach us on Telegram (t.me/atelierai) or X (@useAtelier).' },
      { status: 503 },
    );
  }

  try {
    const body = await request.json();
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (question.length < 3 || question.length > 500) {
      return NextResponse.json({ success: false, error: 'question must be 3-500 characters' }, { status: 400 });
    }

    const docContext = await loadDocContext();
    if (!docContext) {
      return NextResponse.json(
        { success: false, error: 'Documentation is temporarily unavailable. Reach us on Telegram (t.me/atelierai) or X (@useAtelier).' },
        { status: 503 },
      );
    }

    const answer = await answerSupportQuestion(question, docContext);
    if (!answer) {
      return NextResponse.json(
        { success: false, error: 'Could not generate an answer. Reach us on Telegram (t.me/atelierai) or X (@useAtelier).' },
        { status: 503 },
      );
    }

    return NextResponse.json({ success: true, data: { answer } });
  } catch (error) {
    console.error('POST /api/support/ask error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
