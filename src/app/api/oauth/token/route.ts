export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { consumeAuthCode, getClient, issueRefreshToken, rotateRefreshToken } from '@/lib/oauth/store';
import { signAccessToken } from '@/lib/oauth/tokens';
import { originFromRequest, isOAuthConfigured, ACCESS_TOKEN_TTL_SECONDS } from '@/lib/oauth/config';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function s256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function tokenError(error: string, status = 400, description?: string): NextResponse {
  return NextResponse.json({ error, ...(description ? { error_description: description } : {}) }, { status, headers: CORS });
}

async function readParams(request: Request): Promise<Record<string, string>> {
  const ct = request.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v ?? '')]));
  }
  const form = await request.formData().catch(() => null);
  if (!form) return {};
  const out: Record<string, string> = {};
  form.forEach((value, key) => {
    out[key] = String(value);
  });
  return out;
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isOAuthConfigured()) return tokenError('invalid_request', 400, 'OAuth is not enabled');

  const p = await readParams(request);
  const grantType = p.grant_type;
  const clientId = p.client_id;
  const issuer = originFromRequest(request);

  if (!clientId || !(await getClient(clientId))) {
    return tokenError('invalid_client', 401, 'Unknown client_id');
  }

  if (grantType === 'authorization_code') {
    const code = p.code;
    const verifier = p.code_verifier;
    const redirectUri = p.redirect_uri;
    if (!code || !verifier) return tokenError('invalid_request', 400, 'code and code_verifier are required');

    const consumed = await consumeAuthCode(code);
    if (!consumed) return tokenError('invalid_grant', 400, 'Code is invalid, expired, or already used');
    if (consumed.clientId !== clientId) return tokenError('invalid_grant', 400, 'client mismatch');
    if (consumed.redirectUri !== redirectUri) return tokenError('invalid_grant', 400, 'redirect_uri mismatch');
    if (s256(verifier) !== consumed.codeChallenge) return tokenError('invalid_grant', 400, 'PKCE verification failed');

    const accessToken = await signAccessToken({
      userId: consumed.userId,
      clientId,
      scope: consumed.scope,
      resource: consumed.resource,
      issuer,
    });
    const wantsRefresh = consumed.scope.split(' ').includes('offline_access');
    const refreshToken = wantsRefresh
      ? await issueRefreshToken({ clientId, userId: consumed.userId, scope: consumed.scope, resource: consumed.resource })
      : undefined;

    return NextResponse.json(
      {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL_SECONDS,
        scope: consumed.scope,
        ...(refreshToken ? { refresh_token: refreshToken } : {}),
      },
      { headers: CORS },
    );
  }

  if (grantType === 'refresh_token') {
    const refreshToken = p.refresh_token;
    if (!refreshToken) return tokenError('invalid_request', 400, 'refresh_token is required');
    const rotated = await rotateRefreshToken(refreshToken, clientId);
    if (!rotated) return tokenError('invalid_grant', 400, 'refresh_token is invalid, expired, or revoked');

    const accessToken = await signAccessToken({
      userId: rotated.record.userId,
      clientId,
      scope: rotated.record.scope,
      resource: rotated.record.resource,
      issuer,
    });

    return NextResponse.json(
      {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL_SECONDS,
        scope: rotated.record.scope,
        refresh_token: rotated.next,
      },
      { headers: CORS },
    );
  }

  return tokenError('unsupported_grant_type', 400, `Unsupported grant_type: ${grantType}`);
}

export function OPTIONS(): NextResponse {
  return new NextResponse(null, { headers: CORS });
}
