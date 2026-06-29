export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { verifyPrivyAccessToken } from '@/lib/privy-auth';
import { getClient, createAuthCode } from '@/lib/oauth/store';
import { originFromRequest, resourceForOrigin, isOAuthConfigured, SUPPORTED_SCOPES } from '@/lib/oauth/config';

function normalizeScope(requested: unknown): string {
  const set = new Set(SUPPORTED_SCOPES as readonly string[]);
  const req = typeof requested === 'string' && requested.trim() ? requested.split(/\s+/) : ['agent', 'offline_access'];
  const granted = req.filter((s) => set.has(s));
  if (!granted.includes('agent')) granted.push('agent');
  return granted.join(' ');
}

// Consent submission: the /oauth/authorize page authenticates the user via Privy,
// then POSTs here to mint a single-use, PKCE-bound authorization code and get the
// redirect-back URL. The client's MCP token is never minted from a Privy token
// directly -- the code is exchanged at /api/oauth/token.
export async function POST(request: Request): Promise<NextResponse> {
  if (!isOAuthConfigured()) {
    return NextResponse.json({ error: 'invalid_request', error_description: 'OAuth is not enabled' }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const clientId = String(body.client_id ?? '');
  const redirectUri = String(body.redirect_uri ?? '');
  const codeChallenge = String(body.code_challenge ?? '');
  const codeChallengeMethod = String(body.code_challenge_method ?? '');
  const privyToken = String(body.privy_access_token ?? '');
  const state = typeof body.state === 'string' ? body.state : '';

  if (codeChallengeMethod !== 'S256' || !codeChallenge) {
    return NextResponse.json({ error: 'invalid_request', error_description: 'PKCE S256 is required' }, { status: 400 });
  }

  const client = await getClient(clientId);
  if (!client) {
    return NextResponse.json({ error: 'invalid_client', error_description: 'Unknown client_id' }, { status: 400 });
  }
  if (!client.redirectUris.includes(redirectUri)) {
    return NextResponse.json({ error: 'invalid_request', error_description: 'redirect_uri does not match a registered URI' }, { status: 400 });
  }

  let userId: string;
  try {
    const info = await verifyPrivyAccessToken(privyToken);
    userId = info.privyUserId;
  } catch {
    return NextResponse.json({ error: 'access_denied', error_description: 'Not signed in' }, { status: 401 });
  }

  const origin = originFromRequest(request);
  const resource = resourceForOrigin(origin);
  const scope = normalizeScope(body.scope);

  const code = await createAuthCode({ clientId, redirectUri, codeChallenge, userId, scope, resource });

  const redirect = new URL(redirectUri);
  redirect.searchParams.set('code', code);
  if (state) redirect.searchParams.set('state', state);

  return NextResponse.json({ redirect: redirect.toString() });
}
