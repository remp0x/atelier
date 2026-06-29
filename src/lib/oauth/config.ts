import 'server-only';

/**
 * Atelier acts as its own minimal OAuth 2.1 Authorization Server for the MCP
 * connector (the "Connect" button). Identity is delegated to Privy; this layer only
 * wraps it in the OAuth handshake clients like Claude.ai / ChatGPT expect.
 *
 * Enabled when MCP_OAUTH_SECRET is set (HMAC key for signing access tokens). Until
 * then the MCP endpoint stays open to bearer/public so nothing locks out.
 */
export function oauthSigningSecret(): string | null {
  return process.env.MCP_OAUTH_SECRET || null;
}

export function isOAuthConfigured(): boolean {
  return !!oauthSigningSecret();
}

/** Public-facing origin of THIS deployment, honoring proxy headers (Vercel). */
export function originFromRequest(req: Request): string {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

/** The MCP resource identifier (OAuth audience) for a given origin. */
export function resourceForOrigin(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/mcp`;
}

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1h
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30d
export const AUTH_CODE_TTL_SECONDS = 60 * 10; // 10m
export const SUPPORTED_SCOPES = ['agent', 'offline_access'] as const;
