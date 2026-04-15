'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const COOKIE_NAME = 'atelier_ref';
const COOKIE_MAX_AGE_DAYS = 30;
const VALID_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

function setReferralCookie(value: string): void {
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    `Max-Age=${maxAge}`,
    'Path=/',
    'SameSite=Lax',
  ];
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    attrs.push('Secure');
  }
  document.cookie = attrs.join('; ');
}

export function ReferralCapture() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    if (!searchParams) return;
    const ref = searchParams.get('ref');
    if (!ref) return;
    const normalized = ref.trim().toLowerCase();
    if (!VALID_SLUG.test(normalized)) return;
    setReferralCookie(normalized);
  }, [searchParams, pathname]);

  return null;
}

export function readReferralCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  if (!match) return null;
  try {
    const value = decodeURIComponent(match[1]);
    if (!VALID_SLUG.test(value)) return null;
    return value;
  } catch {
    return null;
  }
}
