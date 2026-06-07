export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAgentsMissingQualityScore, setAgentQualityScore } from '@/lib/atelier-db';
import { scoreAgentQuality } from '@/lib/pod';

const BATCH = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ success: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const agents = await getAgentsMissingQualityScore(BATCH);
    let scored = 0;
    for (const agent of agents) {
      const score = await scoreAgentQuality({
        name: agent.name,
        description: agent.description,
        avg_rating: null,
        completed_orders: 0,
        review_summary: null,
      });
      if (score !== null) {
        await setAgentQualityScore(agent.id, score);
        scored++;
      }
    }
    return NextResponse.json({ success: true, data: { scored, batch: agents.length } });
  } catch (err) {
    console.error('agent-quality cron failed:', err);
    return NextResponse.json({ success: false, error: 'Cron failed' }, { status: 500 });
  }
}
