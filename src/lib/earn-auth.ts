import { NextRequest } from 'next/server';
import { AuthError, resolveExternalAgentByApiKey } from './atelier-auth';
import { readPrivyAccessToken, verifyPrivyAccessToken } from './privy-auth';
import { rateLimitByKey } from './rateLimit';
import type { AtelierAgent } from './atelier-db';
import type { EarnOwnerKind } from './parquet-earn-db';

// Shared auth + value helpers for the /api/earn/parquet/* routes. A caller is
// either a headless agent (Bearer atelier_ key) or a human (Privy token). Both
// map to an (ownerKind, ownerId) the ledger keys on.

const USDC_DECIMALS = BigInt(1_000_000);
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface EarnCaller {
  ownerKind: EarnOwnerKind;
  ownerId: string;
  agent: AtelierAgent | null;
  privyUserId: string | null;
}

// 30 deposit/withdraw/read calls per hour per caller.
export const earnRateLimit = rateLimitByKey(30, 60 * 60 * 1000);

export async function resolveEarnCaller(
  request: NextRequest,
  body?: Record<string, unknown> | null,
): Promise<EarnCaller> {
  const authHeader = request.headers.get('authorization') ?? '';
  if (/^Bearer\s+atelier_/i.test(authHeader)) {
    const agent = await resolveExternalAgentByApiKey(request);
    return { ownerKind: 'agent', ownerId: agent.id, agent, privyUserId: null };
  }

  const token = readPrivyAccessToken(request, body ?? null);
  if (token) {
    try {
      const info = await verifyPrivyAccessToken(token);
      return { ownerKind: 'user', ownerId: info.privyUserId, agent: null, privyUserId: info.privyUserId };
    } catch {
      throw new AuthError('Invalid Privy token', 401);
    }
  }

  throw new AuthError(
    'Authentication required: provide an agent API key (Bearer atelier_...) or a Privy token',
    401,
  );
}

export function parseUsdToMicro(value: unknown): bigint {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new AuthError('amount_usd is required (USD amount)', 400);
  }
  const s = String(value).trim();
  if (!/^\d+(\.\d{1,6})?$/.test(s)) {
    throw new AuthError('amount_usd must be a positive USD amount with up to 6 decimals', 400);
  }
  const [whole, frac = ''] = s.split('.');
  const micro = BigInt(whole) * USDC_DECIMALS + BigInt((frac + '000000').slice(0, 6));
  if (micro <= BigInt(0)) throw new AuthError('amount_usd must be positive', 400);
  return micro;
}

export function microToUsdString(micro: bigint): string {
  const neg = micro < BigInt(0);
  const v = neg ? -micro : micro;
  const whole = v / USDC_DECIMALS;
  const frac = (v % USDC_DECIMALS).toString().padStart(6, '0');
  return `${neg ? '-' : ''}${whole}.${frac}`;
}

export function parseSharesArg(value: unknown): bigint {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) {
    throw new AuthError('shares must be a positive integer string', 400);
  }
  const shares = BigInt(value.trim());
  if (shares <= BigInt(0)) throw new AuthError('shares must be positive', 400);
  return shares;
}

export function validateSolanaAddress(value: unknown, field: string): string {
  if (typeof value !== 'string' || !BASE58_REGEX.test(value)) {
    throw new AuthError(`${field} must be a valid base58 Solana address`, 400);
  }
  return value;
}
