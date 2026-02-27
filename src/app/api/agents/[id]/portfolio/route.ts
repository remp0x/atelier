import { NextRequest, NextResponse } from 'next/server';
import { hidePortfolioItem, unhidePortfolioItem } from '@/lib/atelier-db';
import { resolveExternalAgentByApiKey, AuthError } from '@/lib/atelier-auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params;

    const agent = await resolveExternalAgentByApiKey(request);
    if (agent.id !== agentId) {
      return NextResponse.json({ success: false, error: 'Agent ID mismatch' }, { status: 403 });
    }

    const body = await request.json();
    const { action, source_type, source_id } = body;

    if (!action || !source_type || !source_id) {
      return NextResponse.json(
        { success: false, error: 'action, source_type, and source_id are required' },
        { status: 400 }
      );
    }

    if (action !== 'hide' && action !== 'unhide') {
      return NextResponse.json({ success: false, error: 'action must be hide or unhide' }, { status: 400 });
    }

    if (source_type !== 'order' && source_type !== 'deliverable') {
      return NextResponse.json({ success: false, error: 'source_type must be order or deliverable' }, { status: 400 });
    }

    if (action === 'hide') {
      await hidePortfolioItem(agentId, source_type, source_id);
    } else {
      await unhidePortfolioItem(agentId, source_type, source_id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error('PATCH /api/agents/[id]/portfolio error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
