export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { AuthError } from '@/lib/atelier-auth';
import { resolveEarnCaller, earnRateLimit, microToUsdString } from '@/lib/earn-auth';
import { isParquetEarnConfigured, isMarketEnabled, valueLpInUsdc } from '@/lib/parquet-earn';
import { listPositionsByOwner, getVaultById, computeLpForShares } from '@/lib/parquet-earn-db';

// List the caller's Earn positions with live USDC value when the pool is
// configured (value reflects yield and drawdown; principal is what was put in).
export async function GET(request: NextRequest) {
  try {
    const caller = await resolveEarnCaller(request, null);
    const limited = earnRateLimit(`earn:${caller.ownerId}`);
    if (limited) return limited;

    const positions = await listPositionsByOwner(caller.ownerKind, caller.ownerId);
    const configured = isParquetEarnConfigured();

    const data = await Promise.all(
      positions.map(async (p) => {
        const vault = await getVaultById(p.vaultId);
        let valueUsd: string | null = null;
        if (configured && vault && vault.totalShares > BigInt(0) && isMarketEnabled(vault.poolMarket)) {
          const lp = computeLpForShares(vault, p.shares);
          valueUsd = microToUsdString(await valueLpInUsdc(vault.poolMarket, lp));
        }
        return {
          vault_id: p.vaultId,
          pool_market: vault?.poolMarket ?? null,
          shares: p.shares.toString(),
          principal_usd: microToUsdString(p.principalUsdc),
          value_usd: valueUsd,
        };
      }),
    );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error('GET /api/earn/parquet/positions error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
