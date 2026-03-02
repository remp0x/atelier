import { NextRequest, NextResponse } from 'next/server';
import {
  Keypair,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { PUMP_SDK } from '@pump-fun/pump-sdk';
import { getAtelierAgent, updateAgentToken } from '@/lib/atelier-db';
import { requireWalletAuth, WalletAuthError } from '@/lib/solana-auth';
import { getServerConnection, ATELIER_PUBKEY, getAtelierKeypair } from '@/lib/solana-server';
import { rateLimit } from '@/lib/rateLimit';
import { uploadToPumpFunIpfs } from '@/lib/pumpfun-ipfs';
import { validateExternalUrlWithDNS } from '@/lib/url-validation';
import { resolveExternalAgentByApiKey, AuthError } from '@/lib/atelier-auth';

export const maxDuration = 300;

const launchRateLimit = rateLimit(10, 60 * 60 * 1000);

const TOKEN_NAME_SUFFIX = ' by Atelier';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const rateLimitResponse = launchRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    const body = await request.json();

    let agentId = id;

    // Auth: wallet auth from body, or API key from Authorization header
    let verifiedWallet: string | null = null;
    try {
      verifiedWallet = requireWalletAuth(body);
    } catch {
      // Wallet auth failed — try API key
      try {
        const apiAgent = await resolveExternalAgentByApiKey(request);
        if (apiAgent.id !== agentId) {
          return NextResponse.json(
            { success: false, error: 'API key does not belong to this agent' },
            { status: 403 },
          );
        }
      } catch (err) {
        const msg = err instanceof AuthError ? err.message : 'Authentication failed';
        return NextResponse.json({ success: false, error: msg }, { status: 401 });
      }
    }

    const agent = await getAtelierAgent(agentId);
    if (!agent) {
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 },
      );
    }

    if (verifiedWallet && agent.owner_wallet && verifiedWallet !== agent.owner_wallet) {
      return NextResponse.json(
        { success: false, error: 'Only the agent owner can launch a token' },
        { status: 403 },
      );
    }

    if (agent.token_mint) {
      return NextResponse.json(
        { success: false, error: 'Agent already has a token' },
        { status: 409 },
      );
    }

    if (!agent.avatar_url) {
      return NextResponse.json(
        { success: false, error: 'Agent must have an avatar_url set before launching a token' },
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
    const description = agent.description || '';

    const avatarUrlCheck = await validateExternalUrlWithDNS(agent.avatar_url);
    if (!avatarUrlCheck.valid) {
      return NextResponse.json(
        { success: false, error: `Invalid avatar URL: ${avatarUrlCheck.error}` },
        { status: 400 },
      );
    }

    const imageResponse = await fetch(agent.avatar_url);
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

    const { metadataUri } = await uploadToPumpFunIpfs(imageBlob, tokenName, symbol, description);

    const connection = getServerConnection();
    const atelierKeypair = getAtelierKeypair();
    const mintKeypair = Keypair.generate();
    const mint = mintKeypair.publicKey;

    const instruction = await PUMP_SDK.createV2Instruction({
      mint,
      name: tokenName,
      symbol,
      uri: metadataUri,
      creator: ATELIER_PUBKEY,
      user: ATELIER_PUBKEY,
      mayhemMode: false,
    });

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    const messageV0 = new TransactionMessage({
      payerKey: ATELIER_PUBKEY,
      recentBlockhash: blockhash,
      instructions: [instruction],
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([atelierKeypair, mintKeypair]);

    const txSignature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    await connection.confirmTransaction(
      { signature: txSignature, blockhash, lastValidBlockHeight },
      'confirmed',
    );

    const txDetails = await connection.getTransaction(txSignature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });
    if (!txDetails || txDetails.meta?.err) {
      return NextResponse.json(
        { success: false, error: 'Token creation transaction failed on-chain' },
        { status: 400 },
      );
    }

    const mintAddress = mint.toBase58();

    const updated = await updateAgentToken(agentId, {
      token_mint: mintAddress,
      token_name: tokenName,
      token_symbol: symbol,
      token_image_url: agent.avatar_url,
      token_mode: 'pumpfun',
      token_creator_wallet: ATELIER_PUBKEY.toBase58(),
      token_tx_hash: txSignature,
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
    console.error('Token launch error:', error);
    if (error instanceof Error && error.message.includes('PumpFun IPFS upload failed')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
