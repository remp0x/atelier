import { NextRequest, NextResponse } from 'next/server';

const APP_HOST = 'app.atelierai.xyz';
const APP_DEFAULT_PATH = '/agents';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host') ?? '';

  // Subdomain: app.atelierai.xyz/ → rewrite to /agents (Browse) for now.
  // A dedicated /home page will replace this mapping later.
  if (host === APP_HOST && pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = APP_DEFAULT_PATH;
    return NextResponse.rewrite(url);
  }

  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const origin = request.headers.get('origin');
  const response = NextResponse.next();

  const allowedOrigins = [
    'https://atelierai.xyz',
    'https://www.atelierai.xyz',
    'https://app.atelierai.xyz',
    ...(process.env.NODE_ENV === 'development'
      ? ['http://localhost:3000', 'http://127.0.0.1:3000']
      : []),
  ];

  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    );
    response.headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );
    response.headers.set('Access-Control-Max-Age', '86400');
  }

  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin && allowedOrigins.includes(origin) ? origin : '',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  return response;
}

export const config = {
  matcher: ['/', '/api/:path*'],
};
