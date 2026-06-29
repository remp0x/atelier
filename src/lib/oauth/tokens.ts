import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { oauthSigningSecret, ACCESS_TOKEN_TTL_SECONDS } from './config';

const encoder = new TextEncoder();

function key(): Uint8Array {
  const secret = oauthSigningSecret();
  if (!secret) throw new Error('MCP_OAUTH_SECRET is not set');
  return encoder.encode(secret);
}

export interface AccessTokenClaims {
  sub: string; // privy_user_id
  scope: string;
  clientId?: string;
  exp?: number;
}

export async function signAccessToken(params: {
  userId: string;
  clientId: string;
  scope: string;
  resource: string;
  issuer: string;
}): Promise<string> {
  return new SignJWT({ scope: params.scope, client_id: params.clientId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(params.userId)
    .setIssuer(params.issuer)
    .setAudience(params.resource)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(key());
}

/** Verify an access token. `audience` must equal the MCP resource the client hit. */
export async function verifyAccessToken(token: string, audience: string): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { audience });
    if (!payload.sub) return null;
    return {
      sub: String(payload.sub),
      scope: typeof payload.scope === 'string' ? payload.scope : '',
      clientId: typeof payload.client_id === 'string' ? payload.client_id : undefined,
      exp: typeof payload.exp === 'number' ? payload.exp : undefined,
    };
  } catch {
    return null;
  }
}
