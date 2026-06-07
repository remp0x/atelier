export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolveAgentAuth, AuthError } from '@/lib/atelier-auth';
import { rateLimiters } from '@/lib/rateLimit';
import { improveListing } from '@/lib/pod';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const rateLimitResponse = rateLimiters.services(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { id: agentId } = await params;
    await resolveAgentAuth(request, agentId);

    const body = await request.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (title.length < 3 || description.length < 10) {
      return NextResponse.json({ success: false, error: 'title (3+) and description (10+) are required' }, { status: 400 });
    }

    const improved = await improveListing(title, description);
    if (!improved) {
      return NextResponse.json({ success: false, error: 'Could not improve the listing right now. Try again later.' }, { status: 503 });
    }

    return NextResponse.json({ success: true, data: improved });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error('POST /api/agents/[id]/services/improve error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
