export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { PUMP_SDK } from '@pump-fun/pump-sdk';
import { getAtelierAgent, updateAgentToken, markTokenLaunchAttempted, clearTokenLaunchAttempted, userOwnsAtelierAgent } from '@/lib/atelier-db';
import { authenticateUserRequest } from '@/lib/session';
import { tryResolvePrivyUserId } from '@/lib/privy-auth';
import { getServerConnection, ATELIER_PUBKEY, getAtelierKeypair, pollTransactionConfirmation } from '@/lib/solana-server';
import { rateLimit } from '@/lib/rateLimit';
import { uploadToPumpFunIpfs } from '@/lib/pumpfun-ipfs';
import { validateExternalUrlWithDNS } from '@/lib/url-validation';
import { resolveExternalAgentByApiKey, AuthError } from '@/lib/atelier-auth';
import { TOKEN_LAUNCH_PROVIDER } from '@/lib/token-economics';
import { launchTokenOnClawpump, ClawpumpError } from '@/lib/clawpump-client';
import { getSolPriceUsd } from '@/lib/sol-price';

export const maxDuration = 300;

const launchRateLimit = rateLimit(10, 60 * 60 * 1000);

const TOKEN_NAME_SUFFIX = ' by Atelier';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Auto top-up of ClawPump's gasless launch-wallet pool. ClawPump's relayer fronts the
// per-launch gas; under heavy launch volume it drains and /api/v1/launch returns "out of
// funds". Confirmed with the partner: sending SOL to that wallet directly unblocks the
// gasless launch (no proof handoff needed). On that error we wire ~$2 from the Atelier
// wallet to the pool and retry, so the user only ever sees a loader. Tunable via env;
// disable with CLAWPUMP_AUTO_TOPUP=false. NOTE: spends real SOL, and the pool is shared,
// so a top-up can be consumed by another launcher front-running -- keep EZko... funded.
const CLAWPUMP_GASLESS_WALLET = process.env.CLAWPUMP_GASLESS_WALLET?.trim()
  || 'ZPhALZcwXS2K5TmZ1z7LHF5Xp3p4rYyjJurD8gTA6wW';
const CLAWPUMP_TOPUP_USD = Number(process.env.CLAWPUMP_TOPUP_USD || '2');

function clawpumpAutoTopUpEnabled(): boolean {
  return process.env.CLAWPUMP_AUTO_TOPUP !== 'false';
}

async function topUpClawpumpGasless(): Promise<string> {
  const solPrice = await getSolPriceUsd().catch(() => 0);
  // ~$CLAWPUMP_TOPUP_USD of SOL; fall back to a fixed amount if price is unavailable.
  const sol = solPrice > 0 ? CLAWPUMP_TOPUP_USD / solPrice : 0.015;
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
        toPubkey: new PublicKey(CLAWPUMP_GASLESS_WALLET),
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
      privyUserId = await tryResolvePrivyUserId(request, null);
      if (privyUserId) {
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

    const tokenName = agent.name + TOKEN_NAME_SUFFIX;
    // Token description comes from the launch form, falling back to the agent's
    // own description. ClawPump requires >= 20 chars; validate BEFORE taking the
    // launch lock so a too-short description is a clean, retryable error.
    const providedDescription = typeof body.description === 'string' ? body.description.trim() : '';
    const description = providedDescription || (agent.description?.trim() || '');

    if (TOKEN_LAUNCH_PROVIDER === 'clawpump' && description.length < 20) {
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

    const imageBlob = new Blob([imageBuffer], { type: matchedType });

    let mintAddress: string;
    let txSignature: string;
    let tokenMode: 'pumpfun' | 'clawpump';
    let creatorWallet: string;
    let clawpumpAgentId: string | undefined;

    if (TOKEN_LAUNCH_PROVIDER === 'clawpump') {
      // Model B: ClawPump enforces one token per dashboard agent, so the adapter creates a
      // dedicated ClawPump agent (named with the token name) per launch and ClawPump custodies
      // its creator-of-record wallet. The agent's own payout wallet/chain does not gate the
      // launch; the token image is the agent's public avatar_url (validated above); the 65%
      // creator share accrues to the per-agent ClawPump wallet and is distributed off-chain.
      const lockAcquired = await markTokenLaunchAttempted(agentId);
      if (!lockAcquired) {
        return NextResponse.json(
          { success: false, error: 'A token launch is already in progress or was attempted for this agent.' },
          { status: 409 },
        );
      }

      console.log(`[token-launch] Launching via ClawPump for agent ${agentId}`);
      let result;
      try {
        result = await launchTokenOnClawpump({
          name: tokenName,
          symbol,
          description,
          imageUrl: tokenImageUrl,
        });
      } catch (err) {
        if (err instanceof ClawpumpError && err.outOfFunds && clawpumpAutoTopUpEnabled()) {
          // Gasless pool empty -- top it up from the Atelier wallet and retry once.
          try {
            console.log('[token-launch] ClawPump gasless pool empty -- topping up from Atelier wallet');
            const fundSig = await topUpClawpumpGasless();
            console.log(`[token-launch] topped up ClawPump gasless pool tx=${fundSig}`);
          } catch (fundErr) {
            // Top-up failed -- surface ClawPump's original (actionable) message; the
            // launch minted nothing so the outer catch releases the lock for retry.
            console.error('[token-launch] gasless top-up failed:', fundErr);
            throw err;
          }
          try {
            result = await launchTokenOnClawpump({
              name: tokenName,
              symbol,
              description,
              imageUrl: tokenImageUrl,
            });
          } catch (retryErr) {
            if (retryErr instanceof ClawpumpError && retryErr.retriable === false) {
              broadcasted = true;
            }
            throw retryErr;
          }
        } else {
          // ClawPump tears down its per-launch agent on a rejected call, so those
          // failures minted nothing and are safe to retry -- leave broadcasted false
          // so the outer catch releases the lock. Only a non-retriable error (a 200
          // response with no mint address) holds the lock for manual review.
          if (err instanceof ClawpumpError && err.retriable === false) {
            broadcasted = true;
          }
          throw err;
        }
      }
      broadcasted = true;

      console.log(`[token-launch] ClawPump launched mint=${result.mintAddress} under clawpumpAgent=${result.clawpumpAgentId} wallet=${result.creatorWallet}`);
      mintAddress = result.mintAddress;
      txSignature = result.txHash;
      tokenMode = 'clawpump';
      creatorWallet = result.creatorWallet;
      clawpumpAgentId = result.clawpumpAgentId;
    } else {
      console.log(`[token-launch] Uploading metadata to IPFS for agent ${agentId}`);
      const { metadataUri } = await uploadToPumpFunIpfs(imageBlob, tokenName, symbol, description);

      const connection = getServerConnection();
      const atelierKeypair = getAtelierKeypair();
      const mintKeypair = Keypair.generate();
      const mint = mintKeypair.publicKey;

      console.log(`[token-launch] Creating V2 instruction, mint=${mint.toBase58()}`);
      const instruction = await PUMP_SDK.createV2Instruction({
        mint,
        name: tokenName,
        symbol,
        uri: metadataUri,
        creator: ATELIER_PUBKEY,
        user: ATELIER_PUBKEY,
        mayhemMode: false,
      });

      const { blockhash } = await connection.getLatestBlockhash('confirmed');

      const messageV0 = new TransactionMessage({
        payerKey: ATELIER_PUBKEY,
        recentBlockhash: blockhash,
        instructions: [instruction],
      }).compileToV0Message();

      const transaction = new VersionedTransaction(messageV0);
      transaction.sign([atelierKeypair, mintKeypair]);

      const lockAcquired = await markTokenLaunchAttempted(agentId);
      if (!lockAcquired) {
        return NextResponse.json(
          { success: false, error: 'A token launch is already in progress or was attempted for this agent.' },
          { status: 409 },
        );
      }

      console.log(`[token-launch] Sending transaction`);
      txSignature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });
      broadcasted = true;

      console.log(`[token-launch] Polling confirmation for ${txSignature}`);
      await pollTransactionConfirmation(connection, txSignature, 60_000);

      mintAddress = mint.toBase58();
      tokenMode = 'pumpfun';
      creatorWallet = ATELIER_PUBKEY.toBase58();
    }

    console.log(`[token-launch] Confirmed. Saving mint=${mintAddress} to DB`);
    const updated = await updateAgentToken(agentId, {
      token_mint: mintAddress,
      token_name: tokenName,
      token_symbol: symbol,
      token_image_url: tokenImageUrl,
      token_mode: tokenMode,
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
    if (message.includes('PumpFun IPFS upload failed')) {
      return NextResponse.json(
        { success: false, error: message },
        { status: 502 },
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
