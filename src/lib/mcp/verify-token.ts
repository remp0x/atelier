import 'server-only';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { getAtelierAgentByApiKey } from '@/lib/atelier-db';
import { isOAuthConfigured, originFromRequest, resourceForOrigin } from '@/lib/oauth/config';
import { verifyAccessToken } from '@/lib/oauth/tokens';

/**
 * Canonical URI of the MCP resource. The auth path derives the resource per-request from
 * the request origin (works on any host); this fixed value is only for docs/tools that
 * reference a single string. Canonical host is `app.useatelier.ai` (where the app runs);
 * `api.useatelier.ai/mcp` 308-redirects to it.
 */
export const MCP_RESOURCE_URI = process.env.MCP_RESOURCE_URI || 'https://app.useatelier.ai/mcp';

const WORKOS_ISSUER = process.env.WORKOS_MCP_ISSUER || '';
const WORKOS_JWKS_URL =
  process.env.WORKOS_MCP_JWKS_URL ||
  (WORKOS_ISSUER ? `${WORKOS_ISSUER.replace(/\/+$/, '')}/oauth2/jwks` : '');

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks(): ReturnType<typeof createRemoteJWKSet> | null {
  if (!WORKOS_JWKS_URL) return null;
  if (!jwksCache) jwksCache = createRemoteJWKSet(new URL(WORKOS_JWKS_URL));
  return jwksCache;
}

function firstString(...values: unknown[]): string | undefined {
  for (const v of values) if (typeof v === 'string' && v) return v;
  return undefined;
}

/**
 * Resolve an MCP bearer token to an internal identity (mcp-handler is Resource-Server
 * only). Three accepted credentials, unified behind one seam:
 *   1. `atelier_` API key       -> authenticated agent (full marketplace surface).
 *   2. In-house OAuth access JWT -> authenticated user (the "Connect" button).
 *   3. WorkOS OAuth JWT          -> authenticated user (managed-AS fallback).
 * Returns undefined for absent/invalid tokens; mcp-handler then serves the 401 +
 * `WWW-Authenticate` pointer to the Protected Resource Metadata. The token is never
 * forwarded upstream -- the route maps this identity to its own credential.
 */
export async function verifyMcpToken(req: Request, bearer?: string): Promise<AuthInfo | undefined> {
  if (!bearer) return undefined;

  if (bearer.startsWith('atelier_')) {
    const agent = await getAtelierAgentByApiKey(bearer);
    if (!agent) return undefined;
    return {
      token: bearer,
      clientId: agent.id,
      scopes: ['agent'],
      extra: { kind: 'agent', apiKey: bearer, agentId: agent.id },
    };
  }

  // In-house OAuth (the Connect button): our own HS256 access token.
  if (isOAuthConfigured()) {
    const resource = resourceForOrigin(originFromRequest(req));
    const claims = await verifyAccessToken(bearer, resource);
    if (claims) {
      return {
        token: bearer,
        clientId: claims.clientId ?? 'mcp-oauth-client',
        scopes: claims.scope.split(' ').filter(Boolean),
        expiresAt: claims.exp,
        extra: { kind: 'user', userId: claims.sub },
      };
    }
  }

  // WorkOS managed-AS fallback (only if configured).
  const keyset = getJwks();
  if (keyset && WORKOS_ISSUER) {
    try {
      const resource = resourceForOrigin(originFromRequest(req));
      const { payload }: { payload: JWTPayload } = await jwtVerify(bearer, keyset, {
        issuer: WORKOS_ISSUER,
        audience: resource,
      });
      const userId = firstString(payload.privy_user_id, payload.sub);
      const scopes = typeof payload.scope === 'string' ? payload.scope.split(' ').filter(Boolean) : [];
      return {
        token: bearer,
        clientId: firstString(payload.client_id, payload.azp, payload.sub) ?? 'mcp-oauth-client',
        scopes,
        expiresAt: typeof payload.exp === 'number' ? payload.exp : undefined,
        extra: { kind: 'user', userId },
      };
    } catch {
      return undefined;
    }
  }

  return undefined;
}
