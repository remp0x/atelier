export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAtelierAgent, updateAgentToken, markTokenLaunchAttempted, clearTokenLaunchAttempted, recordTokenLaunchFeeTx, userOwnsAtelierAgent, setAgentTwitterIfEmpty, isBannedIdentity } from '@/lib/atelier-db';
import { authenticateUserRequest } from '@/lib/session';
import { tryAuthenticatePrivy, type PrivyUserInfo } from '@/lib/privy-auth';
import { rateLimit, getClientIp, isBlockedIp } from '@/lib/rateLimit';
import { validateExternalUrlWithDNS } from '@/lib/url-validation';
import { violatesReservedBrand } from '@/lib/content-guard';
import { resolveExternalAgentByApiKey, AuthError } from '@/lib/atelier-auth';
import { launchTokenSelfFundedOnClawpump, ClawpumpError, type ClawpumpLaunchResult } from '@/lib/clawpump-client';
import { sendSolFromServerWallet, getServerWalletSolBalance } from '@/lib/privy-server-wallets';
import { ensureAgentSolanaWallet, getLaunchRequirement, insufficientSolBody } from '@/lib/agent-funding';

export const maxDuration = 300;

const launchRateLimit = rateLimit(10, 60 * 60 * 1000);

const TOKEN_NAME_SUFFIX = ' by Atelier';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse | Response> {
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
    // The launch is paid by the AGENT's server wallet and signed by ClawPump, so
    // proving identity is sufficient -- the owner's active wallet is never charged.
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
    const vouchingTwitter = agent.twitter_username?.trim() || privyInfo?.twitterUsername?.trim() || '';
    const hasLinkedX = Boolean(vouchingTwitter);
    if (!hasLinkedX) {
      return NextResponse.json(
        { success: false, error: 'Link an X (Twitter) account before launching a token. This keeps launches spam-free.' },
        { status: 403 },
      );
    }

    // The launcher's durable identity, drawn from the live session and the agent row
    // so it holds regardless of auth path (API key / Privy / wallet).
    const launcher = {
      privyUserId: privyUserId ?? agent.privy_user_id,
      twitter: vouchingTwitter,
      ownerWallet: verifiedWallet ?? agent.owner_wallet,
    };

    if (await isBannedIdentity(launcher)) {
      return NextResponse.json(
        { success: false, error: 'This account is banned from Atelier.' },
        { status: 403 },
      );
    }

    // A single owner may launch one token per agent (enforced below via token_mint).
    // Spam is gated economically by the SOL launch fee the agent's own wallet burns
    // per launch, plus the banned-identity check above and the per-IP rate limit.
    // Content moderation: only a hard 'spam' verdict blocks a launch.
    if (agent.moderation_status === 'spam') {
      return NextResponse.json(
        { success: false, error: 'This agent was flagged as spam and cannot launch a token.' },
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

    // Funding gate: the AGENT's own server wallet pays ClawPump's launch fee (and
    // in return receives the 65% creator-fee share directly). The requirement is
    // resolved live, and an underfunded wallet is rejected here -- before any
    // irreversible work -- with the exact amount and deposit address.
    const agentWallet = await ensureAgentSolanaWallet(agent);
    if (!agentWallet) {
      return NextResponse.json(
        { success: false, error: 'Agent wallet is unavailable. Try again shortly or contact support.' },
        { status: 503 },
      );
    }

    const launchRequirement = await getLaunchRequirement();
    let balanceSol: number | null = null;
    try {
      balanceSol = await getServerWalletSolBalance(agentWallet.address);
    } catch (err) {
      console.error('[token-launch] balance read failed:', err);
    }
    if (balanceSol === null || balanceSol < launchRequirement.requiredSol) {
      return NextResponse.json(
        insufficientSolBody({
          action: 'token_launch',
          requirement: launchRequirement,
          wallet: agentWallet,
          balanceSol,
        }),
        { status: 402 },
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

    // ClawPump is the only launch rail. The agent's server wallet pays the SOL fee
    // and is the creator-of-record, so the 65% creator-fee share accrues straight
    // to it. The SOL fee is paid before the ClawPump call, so a post-payment
    // failure is non-retriable (retrying would double-pay) -- the outer catch
    // holds the lock for manual review.
    const lockedAgentId = agentId;
    const lockResult = await markTokenLaunchAttempted(lockedAgentId);
    if (lockResult !== 'ok') {
      return NextResponse.json(
        { success: false, error: 'A token launch is already in progress or was attempted for this agent.' },
        { status: 409 },
      );
    }

    console.log(`[token-launch] Launching via ClawPump (agent-funded) for agent ${agentId}, payer ${agentWallet.address}`);
    let result: ClawpumpLaunchResult;
    try {
      result = await launchTokenSelfFundedOnClawpump({
        name: tokenName,
        symbol,
        description,
        imageUrl: tokenImageUrl,
        agentName: tokenName,
        // ClawPump verifies the fee payment originates from walletAddress and pays
        // that same wallet the 65% creator fees -- both are the agent's wallet.
        payerWallet: agentWallet.address,
        payLaunchFee: async (destination, sol) => {
          const sig = await sendSolFromServerWallet({
            walletId: agentWallet.walletId,
            walletAddress: agentWallet.address,
            to: destination,
            lamports: Math.max(1, Math.round(sol * 1_000_000_000)),
          });
          await recordTokenLaunchFeeTx(lockedAgentId, sig).catch((err) => {
            console.error('[token-launch] failed to record fee tx (non-blocking):', err);
          });
          return sig;
        },
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
      data: {
        mint: mintAddress,
        tx_signature: txSignature,
        creator_wallet: creatorWallet,
        note: 'Creator fees (65%) accrue directly to the agent wallet.',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[token-launch] Error:', message, error);

    // Only the post-payment window risks a real mint (or a spent fee) we can't
    // see; before that, release the lock so the owner can retry without support.
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
