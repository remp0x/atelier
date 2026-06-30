export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getAtelierAgent,
  userOwnsAtelierAgent,
  isBannedIdentity,
  isSAIDFeeTxUsed,
  reserveSAIDMint,
  releaseSAIDMint,
  setSAIDIdentity,
} from '@/lib/atelier-db';
import { authenticateUserRequest } from '@/lib/session';
import { tryAuthenticatePrivy, type PrivyUserInfo } from '@/lib/privy-auth';
import { resolveExternalAgentByApiKey, AuthError } from '@/lib/atelier-auth';
import { createSAIDAgentLean } from '@/lib/said';
import { rateLimit, getClientIp, isBlockedIp } from '@/lib/rateLimit';
import { parseX402Header, buildFlatPaymentRequirements, buildPaymentRequiredResponse, verifyX402Payment } from '@/lib/x402';

export const maxDuration = 120;

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://useatelier.ai';
// SAID identities are no longer minted for free at registration: the owner pays this
// fee in USDC to the Atelier treasury (Solana), which fronts the on-chain SOL cost.
const SAID_FEE_USD = 1;

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
    // enough -- the mint is signed by the treasury, not the owner's wallet.
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

    // Mint fee: the owner pays SAID_FEE_USD in USDC to the Solana treasury. Web clients
    // pre-pay from their embedded wallet and send the signature as body.payment_tx;
    // machine agents follow the x402 flow (X-PAYMENT header, 402 challenge when absent).
    const paymentRef = parseX402Header(request.headers.get('X-PAYMENT'))
      || (typeof body.payment_tx === 'string' && body.payment_tx.trim() ? body.payment_tx.trim() : null);
    if (!paymentRef) {
      const requirements = buildFlatPaymentRequirements({
        amountUsd: SAID_FEE_USD,
        description: `SAID identity mint for ${agent.name}`,
        resource: `${BASE_URL}/api/agents/${agentId}/said`,
        chain: 'solana',
      });
      return buildPaymentRequiredResponse(requirements);
    }

    if (await isSAIDFeeTxUsed(paymentRef)) {
      return NextResponse.json(
        { success: false, error: 'This payment was already used to mint a SAID identity.' },
        { status: 409 },
      );
    }

    const feeVerification = await verifyX402Payment(paymentRef, SAID_FEE_USD, 'solana');
    if (!feeVerification.verified) {
      return NextResponse.json(
        { success: false, error: `SAID mint fee verification failed: ${feeVerification.error ?? 'unknown error'}` },
        { status: 402 },
      );
    }

    // Reserve the mint and bind the payment atomically (UNIQUE index = replay guard).
    // Cleared on a pre-mint failure so the owner can retry with the same payment.
    const lock = await reserveSAIDMint(agentId, paymentRef);
    if (lock === 'fee_tx_used') {
      return NextResponse.json(
        { success: false, error: 'This payment was already used to mint a SAID identity.' },
        { status: 409 },
      );
    }
    if (lock === 'locked') {
      return NextResponse.json(
        { success: false, error: 'A SAID identity mint is already in progress or completed for this agent.' },
        { status: 409 },
      );
    }

    try {
      const said = await createSAIDAgentLean(agentId, `${BASE_URL}/api/said/card/${agentId}`);
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
        { success: false, error: 'SAID identity mint failed. Your payment was not consumed -- you can retry.' },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error('[said-mint] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
