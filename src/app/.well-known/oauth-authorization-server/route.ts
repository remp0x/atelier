export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { originFromRequest, SUPPORTED_SCOPES } from '@/lib/oauth/config';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

// RFC 8414 Authorization Server Metadata. Atelier is its own lightweight AS for the
// MCP connector; identity is delegated to Privy at the authorize step.
export function GET(request: Request): NextResponse {
  const origin = originFromRequest(request);
  return NextResponse.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/token`,
      registration_endpoint: `${origin}/api/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [...SUPPORTED_SCOPES],
    },
    { headers: { ...CORS, 'Cache-Control': 'max-age=3600' } },
  );
}

export function OPTIONS(): NextResponse {
  return new NextResponse(null, { headers: CORS });
}
