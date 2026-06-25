export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { getAtelierAgent, updateAgentToken, markTokenLaunchAttempted, clearTokenLaunchAttempted, userOwnsAtelierAgent, setAgentTwitterIfEmpty } from '@/lib/atelier-db';
import { authenticateUserRequest } from '@/lib/session';
import { tryAuthenticatePrivy, type PrivyUserInfo } from '@/lib/privy-auth';
import { getServerConnection, ATELIER_PUBKEY, getAtelierKeypair, pollTransactionConfirmation } from '@/lib/solana-server';
import { rateLimit, getClientIp, isBlockedIp } from '@/lib/rateLimit';
import { validateExternalUrlWithDNS } from '@/lib/url-validation';
import { violatesReservedBrand } from '@/lib/content-guard';
import { resolveExternalAgentByApiKey, AuthError } from '@/lib/atelier-auth';
import { launchTokenSelfFundedOnClawpump, ClawpumpError, type ClawpumpLaunchResult } from '@/lib/clawpump-client';

export const maxDuration = 300;

const launchRateLimit = rateLimit(10, 60 * 60 * 1000);

const TOKEN_NAME_SUFFIX = ' by Atelier';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Send `sol` SOL from the Atelier wallet to a destination and return the confirmed signature.
// Used to pay ClawPump's self-funded launch fee (~0.03 SOL).
async function transferSolFromAtelier(destination: string, sol: number): Promise<string> {
  const lamports = Math.max(1, Math.round(sol * 1_000_000_000));
  const connection = getServerConnection();
  const payer = getAtelierKeypair();
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const message = new TransactionMessage({
    payerKey: ATELIER_PUBKEY,
    recentBlockhash: blockhash,
    instructions: [
      SystemProgram.transfer({
        fromPubkey: ATELIER_PUBKEY,
        toPubkey: new PublicKey(destination),
        lamports,
      }),
    ],
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  tx.sign([payer]);
  const sig = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  await pollTransactionConfirmation(connection, sig, 60_000);
  return sig;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let agentId: string | null = null;
  let broadcasted = false;

  try {
    const rateLimitResponse = launchRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    if (isBlockedIp(getClientIp(request))) {
      return NextResponse.json(
        { success: false, error: 'Token launch is not available from this network.' },
        { status: 403 },
      );
    }

    const { id } = await params;
    const body = await request.json();

    agentId = id;

    // Auth + ownership. Three identities may launch:
    //  - machine: the agent's own API key (atelier_...)
    //  - social: a verified Privy token -> ownership via user_id / linked wallets
    //  - legacy: a wallet signature matching the agent's owner_wallet
    // The launch is signed by Atelier/ClawPump (not the owner's wallet), so proving
    // identity is sufficient -- the owner's active wallet need not equal owner_wallet.
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
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 },
      );
    }

    if (authVia === 'privy') {
      const owns = privyUserId ? await userOwnsAtelierAgent(privyUserId, agentId) : false;
      if (!owns) {
        return NextResponse.json(
          { success: false, error: 'Only the agent owner can launch a token' },
          { status: 403 },
        );
      }
    } else if (authVia === 'wallet') {
      if (!agent.owner_wallet || verifiedWallet !== agent.owner_wallet) {
        return NextResponse.json(
          { success: false, error: 'Only the agent owner can launch a token' },
          { status: 403 },
        );
      }
    }

    // Anti-spam: every launch requires a linked X (Twitter) account, regardless of
    // auth path. The owner's linked X auto-propagates to agent.twitter_username on
    // login; for a live Privy session we also accept the handle straight from the
    // verified token (covers a just-linked account whose propagation hasn't run yet).
    // The X handle that vouches for this launch. When the agent row carries no
    // handle yet (propagation lag), the live Privy token is what satisfies the
    // gate -- capture it so the launched token records a traceable account.
    const vouchingTwitter = agent.twitter_username?.trim() || privyInfo?.twitterUsername?.trim() || '';
    const hasLinkedX = Boolean(vouchingTwitter);
    if (!hasLinkedX) {
      return NextResponse.json(
        { success: false, error: 'Link an X (Twitter) account before launching a token. This keeps launches spam-free.' },
        { status: 403 },
      );
    }

    if (agent.token_mint) {
      return NextResponse.json(
        { success: false, error: 'Agent already has a token' },
        { status: 409 },
      );
    }

    if (agent.token_launch_attempted) {
      return NextResponse.json(
        { success: false, error: 'A token launch was already attempted for this agent. Please contact support to resolve.' },
        { status: 409 },
      );
    }

    // The token image defaults to the agent's avatar; the builder may override
    // it by passing image_url (validated below like any external URL).
    const tokenImageUrl = (typeof body.image_url === 'string' && body.image_url.trim())
      ? body.image_url.trim()
      : agent.avatar_url;

    if (!tokenImageUrl) {
      return NextResponse.json(
        { success: false, error: 'A token image is required -- set an agent avatar or upload one.' },
        { status: 400 },
      );
    }

    const { symbol } = body;

    if (typeof symbol !== 'string' || symbol.length < 1 || symbol.length > 10) {
      return NextResponse.json(
        { success: false, error: 'symbol must be 1-10 characters' },
        { status: 400 },
      );
    }

    if (violatesReservedBrand(symbol) || violatesReservedBrand(agent.name)) {
      return NextResponse.json(
        { success: false, error: 'Token name or symbol uses a reserved brand term.' },
        { status: 400 },
      );
    }

    const tokenName = agent.name + TOKEN_NAME_SUFFIX;
    // Token description comes from the launch form, falling back to the agent's
    // own description. ClawPump requires >= 20 chars; validate BEFORE taking the
    // launch lock so a too-short description is a clean, retryable error.
    const providedDescription = typeof body.description === 'string' ? body.description.trim() : '';
    const description = providedDescription || (agent.description?.trim() || '');

    if (description.length < 20) {
      return NextResponse.json(
        { success: false, error: 'Token description must be at least 20 characters.' },
        { status: 400 },
      );
    }

    const avatarUrlCheck = await validateExternalUrlWithDNS(tokenImageUrl);
    if (!avatarUrlCheck.valid) {
      return NextResponse.json(
        { success: false, error: `Invalid token image URL: ${avatarUrlCheck.error}` },
        { status: 400 },
      );
    }

    const imageResponse = await fetch(tokenImageUrl, { signal: AbortSignal.timeout(15_000) });
    if (!imageResponse.ok) {
      return NextResponse.json(
        { success: false, error: `Failed to download agent avatar: ${imageResponse.status}` },
        { status: 502 },
      );
    }

    const contentType = imageResponse.headers.get('content-type') || '';
    const matchedType = ALLOWED_IMAGE_TYPES.find(t => contentType.startsWith(t));
    if (!matchedType) {
      return NextResponse.json(
        { success: false, error: 'Agent avatar must be JPEG, PNG, GIF, or WebP' },
        { status: 400 },
      );
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    if (imageBuffer.byteLength > MAX_IMAGE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'Agent avatar too large (max 5MB)' },
        { status: 400 },
      );
    }

    // ClawPump is the only launch rail (pump.fun direct is disabled). Our 3 free sponsored
    // gasless launches are spent, so every launch uses the self-funded flow: a dedicated
    // ClawPump agent (Model B, token name = agent name; ClawPump custodies its creator-of-record
    // wallet), Atelier pays the ~0.03 SOL launch fee, then submits the payment proof. The fee is
    // paid before the call, so a post-payment failure is non-retriable (retrying would
    // double-pay) -- the outer catch holds the lock for manual review instead of releasing it.
    const lockAcquired = await markTokenLaunchAttempted(agentId);
    if (!lockAcquired) {
      return NextResponse.json(
        { success: false, error: 'A token launch is already in progress or was attempted for this agent.' },
        { status: 409 },
      );
    }

    console.log(`[token-launch] Launching via ClawPump (self-funded) for agent ${agentId}`);
    let result: ClawpumpLaunchResult;
    try {
      result = await launchTokenSelfFundedOnClawpump({
        name: tokenName,
        symbol,
        description,
        imageUrl: tokenImageUrl,
        agentName: tokenName,
        // The fee is paid from (and the 65% earnings accrue to) the Atelier wallet; ClawPump
        // verifies the payment originates from walletAddress, so it must equal the payer.
        payerWallet: ATELIER_PUBKEY.toBase58(),
        payLaunchFee: transferSolFromAtelier,
      });
    } catch (err) {
      if (err instanceof ClawpumpError && err.retriable === false) {
        broadcasted = true;
      }
      throw err;
    }
    broadcasted = true;

    console.log(`[token-launch] ClawPump launched mint=${result.mintAddress} under clawpumpAgent=${result.clawpumpAgentId} wallet=${result.creatorWallet}`);
    const mintAddress = result.mintAddress;
    const txSignature = result.txHash;
    const creatorWallet = result.creatorWallet;
    const clawpumpAgentId = result.clawpumpAgentId;

    console.log(`[token-launch] Confirmed. Saving mint=${mintAddress} to DB`);
    const updated = await updateAgentToken(agentId, {
      token_mint: mintAddress,
      token_name: tokenName,
      token_symbol: symbol,
      token_image_url: tokenImageUrl,
      token_mode: 'clawpump',
      token_creator_wallet: creatorWallet,
      token_tx_hash: txSignature,
      clawpump_agent_id: clawpumpAgentId,
    });

    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'Token already set or agent not found' },
        { status: 409 },
      );
    }

    // Anti-spam audit trail: every launched token must record the X that vouched
    // for it. If the row had no handle, persist the live Privy one (no-op when the
    // agent already carries one). Best-effort -- the mint already succeeded.
    if (!agent.twitter_username?.trim() && vouchingTwitter) {
      await setAgentTwitterIfEmpty(agentId, vouchingTwitter).catch((err) => {
        console.error('[token-launch] Failed to persist vouching X handle:', err);
      });
    }

    return NextResponse.json({
      success: true,
      data: { mint: mintAddress, tx_signature: txSignature },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[token-launch] Error:', message, error);

    // Only the post-broadcast window risks a real mint we can't see; before that,
    // release the lock so the owner can retry instead of needing support.
    if (agentId && !broadcasted) {
      await clearTokenLaunchAttempted(agentId).catch((err) => {
        console.error('[token-launch] Failed to release launch lock:', err);
      });
    }

    if (error instanceof ClawpumpError) {
      return NextResponse.json(
        { success: false, error: message },
        { status: error.status },
      );
    }
    if (message.includes('Transaction failed') || message.includes('confirmation timed out')) {
      return NextResponse.json(
        { success: false, error: message },
        { status: 502 },
      );
    }
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return NextResponse.json(
        { success: false, error: 'External request timed out' },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
