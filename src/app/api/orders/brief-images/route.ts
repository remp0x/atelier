export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { WalletAuthError } from '@/lib/solana-auth';
import { authenticateUserRequest, readSigFieldsFromQuery } from '@/lib/session';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png'];

export async function POST(req: NextRequest): Promise<NextResponse> {
  let wallet: string;
  try {
    wallet = await authenticateUserRequest(req, readSigFieldsFromQuery(req));
  } catch (err) {
    const msg = err instanceof WalletAuthError ? err.message : 'Authentication failed';
    return NextResponse.json({ success: false, error: msg }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ success: false, error: 'file required' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ success: false, error: 'Invalid file type. Use JPEG or PNG.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: 'File too large (max 5MB)' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.type === 'image/png' ? 'png' : 'jpg';
    const walletPrefix = wallet.slice(0, 8);
    const rand = Math.random().toString(36).slice(2, 8);
    const filename = `atelier-orders/briefs/${walletPrefix}-${Date.now()}-${rand}.${ext}`;

    const blob = await put(filename, buffer, {
      access: 'public',
      contentType: file.type,
    });

    return NextResponse.json({ success: true, data: { url: blob.url } });
  } catch (error) {
    console.error('Brief image upload error:', error);
    return NextResponse.json({ success: false, error: 'Upload failed' }, { status: 500 });
  }
}
