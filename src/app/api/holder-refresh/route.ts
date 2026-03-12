export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getAgentsNeedingHolderCheck, updateHolderStatus } from '@/lib/atelier-db';
import { isAtelierHolder } from '@/lib/solana-token-balance';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json({ success: false, error: 'CRON_SECRET not configured' }, { status: 500 });
    }

    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const tokenBuf = Buffer.from(token);
    const secretBuf = Buffer.from(cronSecret);
    if (!token || tokenBuf.length !== secretBuf.length || !timingSafeEqual(tokenBuf, secretBuf)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const agents = await getAgentsNeedingHolderCheck(30);
    let holders = 0;

    for (const agent of agents) {
      try {
        const holder = await isAtelierHolder(agent.owner_wallet);
        await updateHolderStatus(agent.id, holder);
        if (holder) holders++;
      } catch (e) {
        console.error(`Holder check failed for agent ${agent.id}:`, e);
      }
    }

    return NextResponse.json({ success: true, checked: agents.length, holders });
  } catch (error) {
    console.error('Holder refresh error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
