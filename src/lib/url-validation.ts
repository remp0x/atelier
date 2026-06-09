import { lookup } from 'dns/promises';
import { isIP } from 'net';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return false;

  // 10.0.0.0/8
  if (parts[0] === 10) return true;
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;
  // 169.254.0.0/16 (link-local / cloud IMDS)
  if (parts[0] === 169 && parts[1] === 254) return true;
  // 127.0.0.0/8 (loopback)
  if (parts[0] === 127) return true;
  // 0.0.0.0/8
  if (parts[0] === 0) return true;
  // 100.64.0.0/10 (carrier-grade NAT)
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;

  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const addr = ip.toLowerCase();

  // Loopback and unspecified
  if (addr === '::1' || addr === '::') return true;

  // IPv4-mapped (::ffff:a.b.c.d) — evaluate the embedded v4 address
  const mapped = addr.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateIPv4(mapped[1]);

  // Unique local addresses fc00::/7
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true;

  // Link-local fe80::/10
  if (/^fe[89ab]/.test(addr)) return true;

  return false;
}

function isPrivateOrReservedIP(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
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

  // Strip IPv6 brackets so the literal matches isIP() / range checks.
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { valid: false, error: 'URL points to a blocked host' };
  }

  if (isIP(hostname) && isPrivateOrReservedIP(hostname)) {
    return { valid: false, error: 'URL points to a private/internal network' };
  }

  return { valid: true };
}

export async function validateExternalUrlWithDNS(urlString: string): Promise<{ valid: boolean; error?: string }> {
  const staticCheck = validateExternalUrl(urlString);
  if (!staticCheck.valid) return staticCheck;

  const parsed = new URL(urlString);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();

  // Literal IP already covered by the static check; only resolve real hostnames.
  if (isIP(hostname)) return { valid: true };

  try {
    const records = await lookup(hostname, { all: true });
    if (records.length === 0) {
      return { valid: false, error: 'URL host did not resolve to any address' };
    }
    for (const { address } of records) {
      if (isPrivateOrReservedIP(address)) {
        return { valid: false, error: 'URL resolves to a private/internal network' };
      }
    }
  } catch {
    // Fail closed: an unresolvable host is not provably safe.
    return { valid: false, error: 'URL host could not be resolved' };
  }

  return { valid: true };
}
