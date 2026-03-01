import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { uploadToPumpFunIpfs } from '@/lib/pumpfun-ipfs';
import { requireWalletAuth, WalletAuthError } from '@/lib/solana-auth';

const ipfsRateLimit = rateLimit(10, 60 * 60 * 1000);

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = ipfsRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const url = new URL(request.url);
    const wallet = url.searchParams.get('wallet');
    const walletSig = url.searchParams.get('wallet_sig');
    const walletSigTs = url.searchParams.get('wallet_sig_ts');

    if (!wallet || !walletSig || !walletSigTs) {
      return NextResponse.json(
        { success: false, error: 'wallet, wallet_sig, and wallet_sig_ts query params required' },
        { status: 401 },
      );
    }

    try {
      requireWalletAuth({ wallet, wallet_sig: walletSig, wallet_sig_ts: Number(walletSigTs) });
    } catch (err) {
      const msg = err instanceof WalletAuthError ? err.message : 'Authentication failed';
      return NextResponse.json({ success: false, error: msg }, { status: 401 });
    }

    const formData = await request.formData();

    const file = formData.get('file');
    const name = formData.get('name');
    const symbol = formData.get('symbol');
    const description = formData.get('description');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { success: false, error: 'file is required' },
        { status: 400 },
      );
    }

    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File too large (max 5MB)' },
        { status: 400 },
      );
    }

    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP' },
        { status: 400 },
      );
    }

    if (typeof name !== 'string' || name.length < 1 || name.length > 32) {
      return NextResponse.json(
        { success: false, error: 'name must be 1-32 characters' },
        { status: 400 },
      );
    }

    if (typeof symbol !== 'string' || symbol.length < 1 || symbol.length > 10) {
      return NextResponse.json(
        { success: false, error: 'symbol must be 1-10 characters' },
        { status: 400 },
      );
    }

    if (description && (typeof description !== 'string' || description.length > 500)) {
      return NextResponse.json(
        { success: false, error: 'description must be max 500 characters' },
        { status: 400 },
      );
    }

    const result = await uploadToPumpFunIpfs(
      file,
      name,
      symbol,
      typeof description === 'string' ? description : undefined,
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('IPFS proxy error:', error);
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
