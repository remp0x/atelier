export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { put } from '@vercel/blob';
import { WalletAuthError } from '@/lib/solana-auth';
import { authenticateUserRequest, readSigFieldsFromQuery } from '@/lib/session';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const AVATAR_SIZE = 256;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function POST(req: NextRequest): Promise<NextResponse> {
  let walletPrefix = 'anon';
  try {
    const wallet = await authenticateUserRequest(req, readSigFieldsFromQuery(req));
    walletPrefix = wallet.slice(0, 8);
  } catch (err) {
    if (err instanceof WalletAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 401 });
    }
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ success: false, error: 'file required' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ success: false, error: 'Invalid file type. Use JPEG, PNG, WebP, or GIF.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: 'File too large (max 5MB)' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const resized = await sharp(buffer)
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer();

    const filename = `atelier-avatars/profiles/${walletPrefix}-${Date.now()}.webp`;

    const blob = await put(filename, resized, {
      access: 'public',
      contentType: 'image/webp',
    });

    return NextResponse.json({ success: true, data: { url: blob.url } });
  } catch (error) {
    console.error('Avatar upload error:', error);
    return NextResponse.json({ success: false, error: 'Upload failed' }, { status: 500 });
  }
}
