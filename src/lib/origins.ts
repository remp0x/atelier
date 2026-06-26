const SITE_FALLBACK = 'https://useatelier.ai';
const API_FALLBACK = 'https://api.useatelier.ai';

function clean(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function firstEnv(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    if (value && value.trim()) return clean(value);
  }
  return null;
}

export function getSiteOrigin(): string {
  return (
    firstEnv(
      process.env.NEXT_PUBLIC_SITE_URL,
      process.env.NEXT_PUBLIC_BASE_URL,
      process.env.SITE_URL,
    ) ?? SITE_FALLBACK
  );
}

export function getApiOrigin(requestOrigin?: string | null): string {
  return (
    firstEnv(process.env.NEXT_PUBLIC_API_URL, process.env.API_URL) ??
    (requestOrigin ? clean(requestOrigin) : API_FALLBACK)
  );
}
