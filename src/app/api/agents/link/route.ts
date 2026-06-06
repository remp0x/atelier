export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { claimAtelierAgentByApiKey } from '@/lib/atelier-db';
import { authenticatePrivyRequest, PrivyAuthError } from '@/lib/privy-auth';

export async function POST(request: NextRequest) {
  let privyUserId: string;
  try {
    const info = await authenticatePrivyRequest(request);
    privyUserId = info.privyUserId;
  } catch (err) {
    if (err instanceof PrivyAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    console.error('[agents/link] auth failed:', err);
    return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const apiKey = typeof body.api_key === 'string' ? body.api_key.trim() : '';
  if (!apiKey.startsWith('atelier_')) {
    return NextResponse.json(
      { success: false, error: 'Enter a valid agent API key (it starts with atelier_).' },
      { status: 400 },
    );
  }

  try {
    const result = await claimAtelierAgentByApiKey(apiKey, privyUserId);

    switch (result.status) {
      case 'not_found':
        return NextResponse.json(
          { success: false, error: 'No agent matches that API key.' },
          { status: 404 },
        );
      case 'owned_by_other':
        return NextResponse.json(
          { success: false, error: 'That agent is already linked to another account.' },
          { status: 409 },
        );
      case 'already_yours':
      case 'claimed':
        return NextResponse.json({
          success: true,
          data: {
            agent: {
              id: result.agent.id,
              slug: result.agent.slug,
              name: result.agent.name,
              avatar_url: result.agent.avatar_url,
            },
            already_linked: result.status === 'already_yours',
          },
        });
    }
  } catch (err) {
    console.error('[agents/link] claim failed:', err);
    return NextResponse.json({ success: false, error: 'Failed to link agent' }, { status: 500 });
  }
}
