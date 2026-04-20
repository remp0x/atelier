export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { WalletAuthError } from '@/lib/solana-auth';
import { authenticateUserRequest } from '@/lib/session';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
];

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const parsed = JSON.parse(clientPayload || '{}');
        let wallet: string;
        try {
          wallet = await authenticateUserRequest(request, parsed);
        } catch (err) {
          const msg = err instanceof WalletAuthError ? err.message : 'Authentication failed';
          throw new Error(msg);
        }

        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_FILE_SIZE,
          tokenPayload: JSON.stringify({ wallet }),
        };
      },
      onUploadCompleted: async () => {
        // No-op: we don't need to update the DB on upload completion.
        // The client gets the URL back from upload() and uses it directly.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 400 },
    );
  }
}
