import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';

const ipfsRateLimit = rateLimit(10, 60 * 60 * 1000);

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = ipfsRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

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

    const pumpFormData = new FormData();
    pumpFormData.append('file', file);
    pumpFormData.append('name', name);
    pumpFormData.append('symbol', symbol);
    if (description) pumpFormData.append('description', description);

    const response = await fetch('https://pump.fun/api/ipfs', {
      method: 'POST',
      body: pumpFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('PumpFun IPFS error:', response.status, errorText);
      return NextResponse.json(
        { success: false, error: `PumpFun IPFS upload failed: ${response.status}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    return NextResponse.json({
      success: true,
      data: { metadataUri: data.metadataUri || data.uri || data.metadata?.uri },
    });
  } catch (error) {
    console.error('IPFS proxy error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
