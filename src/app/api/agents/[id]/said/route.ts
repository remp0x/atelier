export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getAtelierAgent,
  userOwnsAtelierAgent,
  isBannedIdentity,
  reserveSAIDMint,
  releaseSAIDMint,
  setSAIDIdentity,
} from '@/lib/atelier-db';
import { authenticateUserRequest } from '@/lib/session';
import { tryAuthenticatePrivy, type PrivyUserInfo } from '@/lib/privy-auth';
import { resolveExternalAgentByApiKey, AuthError } from '@/lib/atelier-auth';
import { createSAIDAgentFundedByAgent } from '@/lib/said';
import { getServerWalletSolBalance } from '@/lib/privy-server-wallets';
import { ensureAgentSolanaWallet, getSaidRequirement, insufficientSolBody } from '@/lib/agent-funding';
import { rateLimit, getClientIp, isBlockedIp } from '@/lib/rateLimit';

export const maxDuration = 120;

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://useatelier.ai';

const saidRateLimit = rateLimit(10, 60 * 60 * 1000);

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse | Response> {
  try {
    const rateLimitResponse = saidRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    if (isBlockedIp(getClientIp(request))) {
      return NextResponse.json(
        { success: false, error: 'SAID minting is not available from this network.' },
        { status: 403 },
      );
    }

    const agentId = params.id;
    const body = await request.json().catch(() => ({}));

    // Auth + ownership mirrors the token launch route: an agent API key, a verified
    // Privy session, or a legacy owner-wallet signature may mint. Proving identity is
    // enough -- the mint is funded by the AGENT's server wallet, never the owner's.
    const authHeader = request.headers.get('authorization');
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    let authVia: 'apikey' | 'privy' | 'wallet' | null = null;
    let privyUserId: string | null = null;
    let privyInfo: PrivyUserInfo | null = null;
    let verifiedWallet: string | null = null;

    if (bearer && bearer.startsWith('atelier_')) {
      try {
        const apiAgent = await resolveExternalAgentByApiKey(request);
        if (apiAgent.id !== agentId) {
          return NextResponse.json(
            { success: false, error: 'API key does not belong to this agent' },
            { status: 403 },
          );
        }
        authVia = 'apikey';
      } catch (err) {
        const msg = err instanceof AuthError ? err.message : 'Authentication failed';
        return NextResponse.json({ success: false, error: msg }, { status: 401 });
      }
    } else {
      privyInfo = await tryAuthenticatePrivy(request, body);
      if (privyInfo) {
        privyUserId = privyInfo.privyUserId;
        authVia = 'privy';
      } else {
        try {
          verifiedWallet = await authenticateUserRequest(request, body);
          authVia = 'wallet';
        } catch {
          return NextResponse.json(
            { success: false, error: 'Authentication required' },
            { status: 401 },
          );
        }
      }
    }

    const agent = await getAtelierAgent(agentId);
    if (!agent) {
      return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 });
    }

    if (authVia === 'privy') {
      const owns = privyUserId ? await userOwnsAtelierAgent(privyUserId, agentId) : false;
      if (!owns) {
        return NextResponse.json(
          { success: false, error: 'Only the agent owner can mint a SAID identity' },
          { status: 403 },
        );
      }
    } else if (authVia === 'wallet') {
      if (!agent.owner_wallet || verifiedWallet !== agent.owner_wallet) {
        return NextResponse.json(
          { success: false, error: 'Only the agent owner can mint a SAID identity' },
          { status: 403 },
        );
      }
    }

    if (agent.said_wallet) {
      return NextResponse.json(
        { success: false, error: 'Agent already has a SAID identity', data: { said_wallet: agent.said_wallet } },
        { status: 409 },
      );
    }

    const bannedCheck = {
      privyUserId: privyUserId ?? agent.privy_user_id,
      twitter: agent.twitter_username ?? privyInfo?.twitterUsername ?? null,
      wallet: verifiedWallet ?? agent.owner_wallet,
    };
    if (await isBannedIdentity(bannedCheck)) {
      return NextResponse.json(
        { success: false, error: 'This account is banned from Atelier.' },
        { status: 403 },
      );
    }

    // The agent's own server wallet funds the mint (rent computed live from the
    // chain -- no hardcoded amount). An underfunded wallet is rejected here, with
    // the exact amount and deposit address, before anything irreversible happens.
    const agentWallet = await ensureAgentSolanaWallet(agent);
    if (!agentWallet) {
      return NextResponse.json(
        { success: false, error: 'Agent wallet is unavailable. Try again shortly or contact support.' },
        { status: 503 },
      );
    }

    const saidRequirement = await getSaidRequirement();
    let balanceSol: number | null = null;
    try {
      balanceSol = await getServerWalletSolBalance(agentWallet.address);
    } catch (err) {
      console.error('[said-mint] balance read failed:', err);
    }
    if (balanceSol === null || balanceSol < saidRequirement.requiredSol) {
      return NextResponse.json(
        insufficientSolBody({
          action: 'said_identity',
          requirement: saidRequirement,
          wallet: agentWallet,
          balanceSol,
        }),
        { status: 402 },
      );
    }

    // Reserve the mint (UNIQUE said_fee_tx doubles as the lock; there is no user
    // payment anymore, so a per-agent reservation token fills the slot). Cleared
    // on failure so the owner can retry -- unspent SOL returns to the agent wallet.
    const lock = await reserveSAIDMint(agentId, `agent-funded:${agentId}`);
    if (lock !== 'ok') {
      return NextResponse.json(
        { success: false, error: 'A SAID identity mint is already in progress or completed for this agent.' },
        { status: 409 },
      );
    }

    try {
      const said = await createSAIDAgentFundedByAgent(
        agentId,
        `${BASE_URL}/api/said/card/${agentId}`,
        agentWallet,
        {
          name: agent.name,
          description: `Creative AI agent on useatelier.ai`,
          twitter: agent.twitter_username ? `@${agent.twitter_username.replace(/^@+/, '')}` : undefined,
          website: `${BASE_URL}/agents/${agent.slug || agent.id}`,
        },
      );
      await setSAIDIdentity(agentId, {
        wallet: said.walletAddress,
        pda: said.agentPDA,
        secretKey: said.secretKey,
        txHash: said.txSignature,
      });

      return NextResponse.json({
        success: true,
        data: {
          said_wallet: said.walletAddress,
          said_pda: said.agentPDA,
          tx_signature: said.txSignature,
        },
      });
    } catch (err) {
      await releaseSAIDMint(agentId).catch((releaseErr) => {
        console.error('[said-mint] Failed to release mint reservation:', releaseErr);
      });
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[said-mint] Mint failed:', msg, err);
      return NextResponse.json(
        { success: false, error: 'SAID identity mint failed. Unspent SOL was returned to the agent wallet -- you can retry.' },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error('[said-mint] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
