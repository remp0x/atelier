import { NextRequest, NextResponse } from 'next/server';
import { isLandingPath, isPrivateAppPath } from '@/lib/routing';

const APP_HOST = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.useatelier.ai')
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '');
const LANDING_HOST = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://useatelier.ai')
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '');
const APP_DEFAULT_PATH = '/agents';

const CORS_ALLOWED_ORIGINS = [
  'https://useatelier.ai',
  'https://www.useatelier.ai',
  'https://app.useatelier.ai',
  'https://api.useatelier.ai',
];

function isAllowedCorsOrigin(origin: string | null): origin is string {
  if (!origin) return false;
  if (CORS_ALLOWED_ORIGINS.includes(origin)) return true;
  return (
    process.env.NODE_ENV === 'development' &&
    /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
  );
}

function handleApiCors(request: NextRequest): NextResponse {
  const origin = request.headers.get('origin');
  const allowed = isAllowedCorsOrigin(origin);

  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowed ? origin : '',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const response = NextResponse.next();
  if (allowed) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Max-Age', '86400');
  }
  return response;
}

function redirectToHost(request: NextRequest, host: string): NextResponse {
  const url = request.nextUrl.clone();
  url.host = host;
  url.protocol = 'https:';
  url.port = '';
  return NextResponse.redirect(url, 308);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = (request.headers.get('host') ?? '').toLowerCase();

  // API: CORS only, never host-gated.
  if (pathname.startsWith('/api/')) {
    return handleApiCors(request);
  }

  // Local dev and Vercel preview URLs: one host serves everything, no
  // cross-host redirects (the split only activates on the real domains).
  if (
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1') ||
    host.endsWith('.vercel.app')
  ) {
    return NextResponse.next();
  }

  // app.useatelier.ai serves the app shell; landing routes bounce to the apex.
  if (host === APP_HOST) {
    if (pathname === '/') {
      const url = request.nextUrl.clone();
      url.pathname = APP_DEFAULT_PATH;
      return NextResponse.rewrite(url);
    }
    if (isLandingPath(pathname)) {
      return redirectToHost(request, LANDING_HOST);
    }
    const response = NextResponse.next();
    if (isPrivateAppPath(pathname)) {
      response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    }
    return response;
  }

  // Apex (and anything else pointed here): landing routes serve; app routes bounce to app.
  if (isLandingPath(pathname)) {
    return NextResponse.next();
  }
  return redirectToHost(request, APP_HOST);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
