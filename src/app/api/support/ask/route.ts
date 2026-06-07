export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { rateLimiters } from '@/lib/rateLimit';
import { answerSupportQuestion, isPodConfigured } from '@/lib/pod';
import { retrieveContext } from '@/lib/support-rag';
import { buildMarketplaceContext } from '@/lib/support-marketplace';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://atelierai.xyz';
const DOC_CACHE_TTL_MS = 10 * 60 * 1000;

// Knowledge base for the assistant. llms-full.txt is the comprehensive product
// reference (what Atelier is, buyer flow, categories, pricing, fees, payments,
// live stats); skill.md is the agent-integration guide. Together they cover both
// audiences -- humans hiring agents and agents integrating.
const DOC_SOURCES: Array<{ label: string; path: string; limit: number }> = [
  { label: 'ATELIER PRODUCT REFERENCE', path: '/llms-full.txt', limit: 26000 },
  { label: 'AGENT INTEGRATION GUIDE', path: '/skill.md', limit: 16000 },
];

let cachedDocs: { text: string; at: number } | null = null;

async function loadDocContext(): Promise<string | null> {
  if (cachedDocs && Date.now() - cachedDocs.at < DOC_CACHE_TTL_MS) return cachedDocs.text;
  try {
    const parts = await Promise.all(
      DOC_SOURCES.map(async ({ label, path, limit }) => {
        try {
          const res = await fetch(`${BASE_URL}${path}`, { signal: AbortSignal.timeout(5000) });
          if (!res.ok) return null;
          return `=== ${label} ===\n${(await res.text()).slice(0, limit)}`;
        } catch {
          return null;
        }
      }),
    );
    const text = parts.filter(Boolean).join('\n\n');
    if (!text) return cachedDocs?.text ?? null;
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

    // RAG: retrieve the doc passages most relevant to the question (fall back to
    // whole docs if retrieval is unavailable), and pull a live marketplace
    // snapshot so the assistant can answer data questions (top agents, agents by
    // category, highest market-cap token). Both are best-effort.
    const [retrieved, marketplace] = await Promise.all([
      retrieveContext(question),
      buildMarketplaceContext(),
    ]);
    if (!retrieved) console.warn('support/ask: RAG retrieval unavailable, using whole-doc fallback');
    const docContext = retrieved ?? (await loadDocContext());
    if (!docContext) {
      return NextResponse.json(
        { success: false, error: 'Documentation is temporarily unavailable. Reach us on Telegram (t.me/atelierai) or X (@useAtelier).' },
        { status: 503 },
      );
    }

    const context = marketplace ? `${marketplace}\n\n${docContext}` : docContext;
    const answer = await answerSupportQuestion(question, context);
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
