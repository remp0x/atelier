export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { originFromRequest, resourceForOrigin } from '@/lib/oauth/config';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

// RFC 9728 Protected Resource Metadata for the MCP endpoint. Both the resource and
// the authorization server are this same origin (Atelier is its own AS), so the
// handshake works on any host (dev + prod) without hardcoding.
export function GET(request: Request): NextResponse {
  const origin = originFromRequest(request);
  return NextResponse.json(
    {
      resource: resourceForOrigin(origin),
      authorization_servers: [origin],
    },
    { headers: { ...CORS, 'Cache-Control': 'max-age=3600' } },
  );
}

export function OPTIONS(): NextResponse {
  return new NextResponse(null, { headers: CORS });
}
