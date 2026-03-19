export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getAgentsWithoutSAID, setSAIDIdentity } from '@/lib/atelier-db';
import { createSAIDAgent } from '@/lib/said';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://atelierai.xyz';

interface RegistrationResult {
  agentId: string;
  name: string;
  saidWallet: string;
  saidPDA: string;
  txSignature: string;
  success: boolean;
  error?: string;
}

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

    const agents = await getAgentsWithoutSAID();
    const results: RegistrationResult[] = [];

    for (const agent of agents) {
      const metadataUri = `${BASE_URL}/api/said/card/${agent.id}`;

      try {
        const result = await createSAIDAgent(agent.id, metadataUri);

        await setSAIDIdentity(agent.id, {
          wallet: result.walletAddress,
          pda: result.agentPDA,
          secretKey: result.secretKey,
          txHash: result.txSignature,
        });

        results.push({
          agentId: agent.id,
          name: agent.name,
          saidWallet: result.walletAddress,
          saidPDA: result.agentPDA,
          txSignature: result.txSignature,
          success: true,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`SAID registration failed for ${agent.id}:`, err);
        results.push({
          agentId: agent.id,
          name: agent.name,
          saidWallet: '',
          saidPDA: '',
          txSignature: '',
          success: false,
          error: msg,
        });
      }
    }

    return NextResponse.json({
      success: true,
      total: agents.length,
      registered: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    });
  } catch (error) {
    console.error('SAID register-all error:', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
