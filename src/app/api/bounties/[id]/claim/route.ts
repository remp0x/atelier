export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getBountyById, createBountyClaim, getClaimByBountyAndAgent,
  getClaimsCountForBounty, getAtelierAgent,
  withdrawBountyClaim, MAX_CLAIMS_PER_BOUNTY,
} from '@/lib/atelier-db';
import type { AtelierAgent } from '@/lib/atelier-db';
import { resolveExternalAgentByApiKey, AuthError } from '@/lib/atelier-auth';
import { requireWalletAuth, WalletAuthError } from '@/lib/solana-auth';
import { rateLimiters } from '@/lib/rateLimit';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const rateLimitResponse = rateLimiters.orders(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const { message, agent_id, client_wallet } = body;

    let agent: AtelierAgent | null = null;
    let claimantWallet: string | undefined;

    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      try {
        agent = await resolveExternalAgentByApiKey(request);
      } catch (err) {
        const status = err instanceof AuthError ? err.statusCode : 401;
        const msg = err instanceof AuthError ? err.message : 'Authentication failed';
        return NextResponse.json({ success: false, error: msg }, { status });
      }
    } else if (client_wallet) {
      let verifiedWallet: string;
      try {
        verifiedWallet = requireWalletAuth({
          wallet: client_wallet,
          wallet_sig: body.wallet_sig,
          wallet_sig_ts: body.wallet_sig_ts,
        });
      } catch (err) {
        const msg = err instanceof WalletAuthError ? err.message : 'Authentication failed';
        return NextResponse.json({ success: false, error: msg }, { status: 401 });
      }

      if (verifiedWallet !== client_wallet) {
        return NextResponse.json({ success: false, error: 'Wallet mismatch' }, { status: 403 });
      }

      if (!agent_id) {
        return NextResponse.json({ success: false, error: 'agent_id required for wallet auth claims' }, { status: 400 });
      }

      agent = await getAtelierAgent(agent_id);
      if (!agent) {
        return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 });
      }

      if (agent.owner_wallet !== verifiedWallet) {
        return NextResponse.json({ success: false, error: 'You do not own this agent' }, { status: 403 });
      }

      claimantWallet = verifiedWallet;
    } else {
      return NextResponse.json({ success: false, error: 'Authentication required (API key or wallet signature)' }, { status: 401 });
    }

    if (!agent!.twitter_username) {
      return NextResponse.json({ success: false, error: 'Agent must be verified (Twitter) before claiming bounties' }, { status: 403 });
    }

    if (!agent!.active) {
      return NextResponse.json({ success: false, error: 'Agent is not active' }, { status: 403 });
    }

    const bounty = await getBountyById(params.id);
    if (!bounty) {
      return NextResponse.json({ success: false, error: 'Bounty not found' }, { status: 404 });
    }

    if (bounty.status !== 'open') {
      return NextResponse.json({ success: false, error: 'Bounty is not open for claims' }, { status: 400 });
    }

    if (new Date(bounty.expires_at) < new Date()) {
      return NextResponse.json({ success: false, error: 'Bounty has expired' }, { status: 400 });
    }

    const existingClaim = await getClaimByBountyAndAgent(params.id, agent!.id);
    if (existingClaim && existingClaim.status !== 'withdrawn') {
      return NextResponse.json({ success: false, error: 'Agent already has a claim on this bounty' }, { status: 409 });
    }

    const claimsCount = await getClaimsCountForBounty(params.id);
    if (claimsCount >= MAX_CLAIMS_PER_BOUNTY) {
      return NextResponse.json({ success: false, error: 'Bounty has reached maximum claims' }, { status: 400 });
    }

    if (message && (typeof message !== 'string' || message.length > 500)) {
      return NextResponse.json({ success: false, error: 'Message must be under 500 characters' }, { status: 400 });
    }

    const claim = await createBountyClaim({
      bounty_id: params.id,
      agent_id: agent!.id,
      claimant_wallet: claimantWallet,
      message: message || undefined,
    });

    return NextResponse.json({ success: true, data: claim }, { status: 201 });
  } catch (error) {
    console.error('Error creating bounty claim:', error);
    return NextResponse.json({ success: false, error: 'Failed to create claim' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    let agentId: string | undefined;

    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const agent = await resolveExternalAgentByApiKey(request);
        agentId = agent.id;
      } catch (err) {
        const status = err instanceof AuthError ? err.statusCode : 401;
        const msg = err instanceof AuthError ? err.message : 'Authentication failed';
        return NextResponse.json({ success: false, error: msg }, { status });
      }
    } else {
      const url = new URL(request.url);
      const wallet = url.searchParams.get('client_wallet');
      const agentIdParam = url.searchParams.get('agent_id');

      if (!wallet || !agentIdParam) {
        return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
      }

      try {
        requireWalletAuth({
          wallet,
          wallet_sig: url.searchParams.get('wallet_sig') || '',
          wallet_sig_ts: Number(url.searchParams.get('wallet_sig_ts') || 0),
        });
      } catch (err) {
        const msg = err instanceof WalletAuthError ? err.message : 'Authentication failed';
        return NextResponse.json({ success: false, error: msg }, { status: 401 });
      }

      const agent = await getAtelierAgent(agentIdParam);
      if (!agent || agent.owner_wallet !== wallet) {
        return NextResponse.json({ success: false, error: 'Agent not found or not owned by wallet' }, { status: 403 });
      }
      agentId = agentIdParam;
    }

    await withdrawBountyClaim(params.id, agentId!);
    return NextResponse.json({ success: true, data: { bounty_id: params.id, status: 'withdrawn' } });
  } catch (error) {
    console.error('Error withdrawing claim:', error);
    return NextResponse.json({ success: false, error: 'Failed to withdraw claim' }, { status: 500 });
  }
}
