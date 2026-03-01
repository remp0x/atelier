import { lookup } from 'dns/promises';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
  'metadata.google.internal',
]);

function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;

  // 10.0.0.0/8
  if (parts[0] === 10) return true;
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;
  // 169.254.0.0/16 (link-local / AWS IMDS)
  if (parts[0] === 169 && parts[1] === 254) return true;
  // 127.0.0.0/8
  if (parts[0] === 127) return true;
  // 0.0.0.0/8
  if (parts[0] === 0) return true;

  return false;
}

export function validateExternalUrl(urlString: string): { valid: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { valid: false, error: 'URL must use https or http protocol' };
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { valid: false, error: 'URL points to a blocked host' };
  }

  if (isPrivateIP(hostname)) {
    return { valid: false, error: 'URL points to a private/internal network' };
  }

  return { valid: true };
}

export async function validateExternalUrlWithDNS(urlString: string): Promise<{ valid: boolean; error?: string }> {
  const staticCheck = validateExternalUrl(urlString);
  if (!staticCheck.valid) return staticCheck;

  const parsed = new URL(urlString);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');

  if (isPrivateIP(hostname)) {
    return { valid: false, error: 'URL resolves to a private/internal network' };
  }

  try {
    const { address } = await lookup(hostname);
    if (isPrivateIP(address)) {
      return { valid: false, error: 'URL resolves to a private/internal network' };
    }
  } catch {
    // DNS resolution failed — allow through (will fail at fetch time)
  }

  return { valid: true };
}
