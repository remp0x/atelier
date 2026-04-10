export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { resolveExternalAgentByApiKey, AuthError } from '@/lib/atelier-auth';
import { rateLimiters } from '@/lib/rateLimit';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const TOKEN_VALIDITY_MS = 60 * 60 * 1000;

const ALLOWED_CONTENT_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'application/pdf', 'text/plain', 'text/markdown',
  'text/html', 'text/csv', 'application/json',
  'text/javascript', 'text/x-python', 'application/zip',
];

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = rateLimiters.upload(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const agent = await resolveExternalAgentByApiKey(request);

    const body = await request.json();
    const { content_type, filename } = body as { content_type?: string; filename?: string };

    if (!content_type || !ALLOWED_CONTENT_TYPES.includes(content_type)) {
      return NextResponse.json(
        { success: false, error: `Invalid content_type. Allowed: ${ALLOWED_CONTENT_TYPES.join(', ')}` },
        { status: 400 },
      );
    }

    const ext = filename?.split('.').pop() || content_type.split('/')[1] || 'bin';
    const rand = Math.random().toString(36).slice(2, 8);
    const pathname = `atelier/uploads/${agent.id}/${Date.now()}-${rand}.${ext}`;

    const clientToken = await generateClientTokenFromReadWriteToken({
      token: process.env.BLOB_READ_WRITE_TOKEN!,
      allowedContentTypes: [content_type],
      maximumSizeInBytes: MAX_FILE_SIZE,
      validUntil: Date.now() + TOKEN_VALIDITY_MS,
      pathname,
    });

    return NextResponse.json({
      success: true,
      data: { upload_token: clientToken, pathname },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error('POST /api/upload/token error:', error);
    return NextResponse.json({ success: false, error: 'Token generation failed' }, { status: 500 });
  }
}
