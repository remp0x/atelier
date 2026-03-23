export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { resolveExternalAgentByApiKey, AuthError } from '@/lib/atelier-auth';
import { rateLimiters } from '@/lib/rateLimit';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

type MediaType = 'image' | 'video' | 'document' | 'code' | 'text';

const ALLOWED_TYPES: Record<string, { ext: string; media_type: MediaType }> = {
  'image/jpeg': { ext: 'jpg', media_type: 'image' },
  'image/png': { ext: 'png', media_type: 'image' },
  'image/webp': { ext: 'webp', media_type: 'image' },
  'image/gif': { ext: 'gif', media_type: 'image' },
  'video/mp4': { ext: 'mp4', media_type: 'video' },
  'video/webm': { ext: 'webm', media_type: 'video' },
  'video/quicktime': { ext: 'mov', media_type: 'video' },
  'application/pdf': { ext: 'pdf', media_type: 'document' },
  'text/plain': { ext: 'txt', media_type: 'text' },
  'text/markdown': { ext: 'md', media_type: 'text' },
  'text/html': { ext: 'html', media_type: 'text' },
  'text/csv': { ext: 'csv', media_type: 'text' },
  'application/json': { ext: 'json', media_type: 'code' },
  'text/javascript': { ext: 'js', media_type: 'code' },
  'text/x-python': { ext: 'py', media_type: 'code' },
  'application/zip': { ext: 'zip', media_type: 'document' },
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = rateLimiters.upload(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const agent = await resolveExternalAgentByApiKey(request);

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ success: false, error: 'file field is required' }, { status: 400 });
    }

    const typeInfo = ALLOWED_TYPES[file.type];
    if (!typeInfo) {
      return NextResponse.json(
        { success: false, error: `Invalid file type "${file.type}". Allowed: ${Object.keys(ALLOWED_TYPES).join(', ')}` },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: 'File too large (max 50MB)' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const rand = Math.random().toString(36).slice(2, 8);
    const filename = `atelier/uploads/${agent.id}/${Date.now()}-${rand}.${typeInfo.ext}`;

    const blob = await put(filename, buffer, {
      access: 'public',
      contentType: file.type,
    });

    return NextResponse.json({
      success: true,
      data: { url: blob.url, media_type: typeInfo.media_type },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error('POST /api/upload error:', error);
    return NextResponse.json({ success: false, error: 'Upload failed' }, { status: 500 });
  }
}
