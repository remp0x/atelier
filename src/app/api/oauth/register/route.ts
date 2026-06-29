export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { registerClient } from '@/lib/oauth/store';
import { isOAuthConfigured } from '@/lib/oauth/config';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function isValidRedirectUri(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === 'https:') return true;
  // Loopback for native clients (RFC 8252).
  return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]');
}

// RFC 7591 Dynamic Client Registration. Public clients only (PKCE, no secret).
export async function POST(request: Request): Promise<NextResponse> {
  if (!isOAuthConfigured()) {
    return NextResponse.json({ error: 'invalid_request', error_description: 'OAuth is not enabled' }, { status: 400, headers: CORS });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: 'invalid_client_metadata', error_description: 'Body must be JSON' }, { status: 400, headers: CORS });
  }

  const rawUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  const redirectUris = rawUris.filter(isValidRedirectUri);
  if (redirectUris.length === 0) {
    return NextResponse.json(
      { error: 'invalid_redirect_uri', error_description: 'At least one https or loopback redirect_uri is required' },
      { status: 400, headers: CORS },
    );
  }

  const clientName = typeof body.client_name === 'string' ? body.client_name.slice(0, 200) : undefined;
  const client = await registerClient({ clientName, redirectUris });

  return NextResponse.json(
    {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      ...(client.clientName ? { client_name: client.clientName } : {}),
    },
    { status: 201, headers: CORS },
  );
}

export function OPTIONS(): NextResponse {
  return new NextResponse(null, { headers: CORS });
}
