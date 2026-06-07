export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { rateLimiters } from '@/lib/rateLimit';
import { isPodConfigured, podSynthesizeSpeech } from '@/lib/pod';
import { isElevenLabsConfigured, synthesizeElevenLabs } from '@/lib/tts/elevenlabs';

const MAX_CHARS = 800;
// Pod has no audio endpoint today; only try it if explicitly enabled (future-proof).
const POD_TTS_ENABLED = process.env.POD_TTS_ENABLED === 'true';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = rateLimiters.comments(request);
  if (rateLimitResponse) return rateLimitResponse;

  if (!isElevenLabsConfigured() && !(POD_TTS_ENABLED && isPodConfigured())) {
    return NextResponse.json({ success: false, error: 'Voice is not configured' }, { status: 503 });
  }

  let text = '';
  try {
    const body = await request.json();
    text = typeof body.text === 'string' ? body.text.trim() : '';
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ success: false, error: 'text required' }, { status: 400 });
  }
  const clipped = text.slice(0, MAX_CHARS);

  let audio = await synthesizeElevenLabs(clipped);
  if (!audio && POD_TTS_ENABLED) audio = await podSynthesizeSpeech(clipped);
  if (!audio) {
    return NextResponse.json({ success: false, error: 'Voice synthesis failed' }, { status: 503 });
  }

  return new NextResponse(audio, {
    status: 200,
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
  });
}
