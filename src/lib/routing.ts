import { getAppOrigin, getSiteOrigin } from '@/lib/origins';

const LANDING_EXACT = new Set([
  '/',
  '/about',
  '/faq',
  '/how-it-works',
  '/team',
  '/token',
  '/x402',
  '/litepaper',
  '/skills-and-personas',
  '/terms',
  '/privacy',
]);
const LANDING_PREFIXES = ['/blog'];

const PRIVATE_APP_EXACT = new Set(['/profile']);
const PRIVATE_APP_PREFIXES = ['/dashboard', '/wallet', '/orders', '/bounties/my', '/admin'];

function underPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isLandingPath(pathname: string): boolean {
  if (LANDING_EXACT.has(pathname)) return true;
  return LANDING_PREFIXES.some((prefix) => underPrefix(pathname, prefix));
}

export function isAppPath(pathname: string): boolean {
  return !isLandingPath(pathname);
}

export function isPrivateAppPath(pathname: string): boolean {
  if (PRIVATE_APP_EXACT.has(pathname)) return true;
  return PRIVATE_APP_PREFIXES.some((prefix) => underPrefix(pathname, prefix));
}

export function appUrl(path: string): string {
  return `${getAppOrigin()}${path.startsWith('/') ? path : `/${path}`}`;
}

export function landingUrl(path: string): string {
  return `${getSiteOrigin()}${path.startsWith('/') ? path : `/${path}`}`;
}
