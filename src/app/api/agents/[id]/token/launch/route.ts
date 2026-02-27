import { NextRequest, NextResponse } from 'next/server';
import {
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  PUMP_SDK,
  getBuyTokenAmountFromSolAmount,
  OnlinePumpSdk,
} from '@pump-fun/pump-sdk';
import BN from 'bn.js';
import { getAtelierAgent, updateAgentToken } from '@/lib/atelier-db';
import { requireWalletAuth, WalletAuthError } from '@/lib/solana-auth';
import { getServerConnection, ATELIER_PUBKEY } from '@/lib/solana-server';
import { rateLimit } from '@/lib/rateLimit';
import { uploadToPumpFunIpfs } from '@/lib/pumpfun-ipfs';

const launchRateLimit = rateLimit(10, 60 * 60 * 1000);

const TOKEN_NAME_SUFFIX = ' by Atelier';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const PENDING_TTL_MS = 5 * 60 * 1000;

interface PendingLaunch {
  mint: string;
  agentId: string;
  wallet: string;
  tokenName: string;
  tokenSymbol: string;
  metadataUri: string;
  imageUrl: string;
  expiresAt: number;
}

const pendingLaunches = new Map<string, PendingLaunch>();

function cleanExpiredLaunches(): void {
  const now = Date.now();
  pendingLaunches.forEach((entry, key) => {
    if (now > entry.expiresAt) pendingLaunches.delete(key);
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const rateLimitResponse = launchRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    const body = await request.json();

    let verifiedWallet: string;
    try {
      verifiedWallet = requireWalletAuth(body);
    } catch (err) {
      const msg = err instanceof WalletAuthError ? err.message : 'Authentication failed';
      return NextResponse.json({ success: false, error: msg }, { status: 401 });
    }

    const agent = await getAtelierAgent(id);
    if (!agent) {
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 },
      );
    }

    if (!agent.owner_wallet || verifiedWallet !== agent.owner_wallet) {
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

    const { symbol, dev_buy_sol } = body;

    if (typeof symbol !== 'string' || symbol.length < 1 || symbol.length > 10) {
      return NextResponse.json(
        { success: false, error: 'symbol must be 1-10 characters' },
        { status: 400 },
      );
    }

    const devBuySol = typeof dev_buy_sol === 'number' ? dev_buy_sol : 0;
    if (devBuySol < 0) {
      return NextResponse.json(
        { success: false, error: 'dev_buy_sol must be >= 0' },
        { status: 400 },
      );
    }

    const tokenName = agent.name + TOKEN_NAME_SUFFIX;
    const description = agent.description || '';

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
    const mintKeypair = Keypair.generate();
    const mint = mintKeypair.publicKey;
    const userPubkey = new PublicKey(verifiedWallet);

    let instructions;
    if (devBuySol > 0) {
      const onlineSdk = new OnlinePumpSdk(connection);
      const [global, feeConfig] = await Promise.all([
        onlineSdk.fetchGlobal(),
        onlineSdk.fetchFeeConfig(),
      ]);
      const solAmount = new BN(Math.floor(devBuySol * 1e9));
      const tokenAmount = getBuyTokenAmountFromSolAmount({
        global,
        feeConfig,
        mintSupply: null,
        bondingCurve: null,
        amount: solAmount,
      });

      instructions = await PUMP_SDK.createV2AndBuyInstructions({
        global,
        mint,
        name: tokenName,
        symbol,
        uri: metadataUri,
        creator: ATELIER_PUBKEY,
        user: userPubkey,
        amount: tokenAmount,
        solAmount,
        mayhemMode: false,
      });
    } else {
      instructions = [
        await PUMP_SDK.createV2Instruction({
          mint,
          name: tokenName,
          symbol,
          uri: metadataUri,
          creator: ATELIER_PUBKEY,
          user: userPubkey,
          mayhemMode: false,
        }),
      ];
    }

    const { blockhash } = await connection.getLatestBlockhash('confirmed');

    const messageV0 = new TransactionMessage({
      payerKey: userPubkey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([mintKeypair]);

    const txBase64 = Buffer.from(transaction.serialize()).toString('base64');
    const mintAddress = mint.toBase58();

    cleanExpiredLaunches();
    pendingLaunches.set(`${id}:${mintAddress}`, {
      mint: mintAddress,
      agentId: id,
      wallet: verifiedWallet,
      tokenName,
      tokenSymbol: symbol,
      metadataUri,
      imageUrl: agent.avatar_url,
      expiresAt: Date.now() + PENDING_TTL_MS,
    });

    return NextResponse.json({
      success: true,
      data: { transaction: txBase64, mint: mintAddress },
    });
  } catch (error) {
    console.error('Token launch prepare error:', error);
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const rateLimitResponse = launchRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    const body = await request.json();

    let verifiedWallet: string;
    try {
      verifiedWallet = requireWalletAuth(body);
    } catch (err) {
      const msg = err instanceof WalletAuthError ? err.message : 'Authentication failed';
      return NextResponse.json({ success: false, error: msg }, { status: 401 });
    }

    const agent = await getAtelierAgent(id);
    if (!agent) {
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 },
      );
    }

    if (!agent.owner_wallet || verifiedWallet !== agent.owner_wallet) {
      return NextResponse.json(
        { success: false, error: 'Only the agent owner can launch a token' },
        { status: 403 },
      );
    }

    const { transaction: txBase64, mint } = body;

    if (typeof txBase64 !== 'string' || typeof mint !== 'string') {
      return NextResponse.json(
        { success: false, error: 'transaction (base64) and mint are required' },
        { status: 400 },
      );
    }

    cleanExpiredLaunches();
    const pendingKey = `${id}:${mint}`;
    const pending = pendingLaunches.get(pendingKey);
    if (!pending) {
      return NextResponse.json(
        { success: false, error: 'No pending launch found for this mint. It may have expired (5 min TTL).' },
        { status: 404 },
      );
    }

    if (pending.wallet !== verifiedWallet) {
      return NextResponse.json(
        { success: false, error: 'Wallet mismatch with pending launch' },
        { status: 403 },
      );
    }

    const connection = getServerConnection();

    const txBytes = Buffer.from(txBase64, 'base64');
    const transaction = VersionedTransaction.deserialize(txBytes);

    const txSignature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
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

    const updated = await updateAgentToken(id, {
      token_mint: mint,
      token_name: pending.tokenName,
      token_symbol: pending.tokenSymbol,
      token_image_url: pending.imageUrl,
      token_mode: 'pumpfun',
      token_creator_wallet: verifiedWallet,
      token_tx_hash: txSignature,
    });

    pendingLaunches.delete(pendingKey);

    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'Token already set or agent not found' },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        mint,
        tx_signature: txSignature,
        token_info: {
          token_mint: mint,
          token_name: pending.tokenName,
          token_symbol: pending.tokenSymbol,
          token_image_url: pending.imageUrl,
          token_mode: 'pumpfun',
          token_creator_wallet: verifiedWallet,
          token_tx_hash: txSignature,
        },
      },
    });
  } catch (error) {
    console.error('Token launch submit error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
