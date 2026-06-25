export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { AuthError } from '@/lib/atelier-auth';
import { getAtelierAgentsByUser } from '@/lib/atelier-db';
import { resolveEarnCaller, earnRateLimit, microToUsdString } from '@/lib/earn-auth';
import { isAnyEarnConfigured, tryGetVenue, parseVenueKey } from '@/lib/earn/registry';
import { listPositionsByOwner, getVaultById, computeLpForShares, type EarnOwnerKind } from '@/lib/parquet-earn-db';

interface PositionSource {
  ownerKind: EarnOwnerKind;
  ownerId: string;
  ownedBy: string; // 'you' for the caller, otherwise the agent's name
  agentId: string | null;
}

// List the caller's Earn positions with live USDC value. For a human caller we
// also surface positions held by the agents they own, so the owner sees their
// agents' deposits alongside their own (each tagged with who holds it).
export async function GET(request: NextRequest) {
  try {
    const caller = await resolveEarnCaller(request, null);
    const limited = earnRateLimit(`earn:${caller.ownerId}`);
    if (limited) return limited;

    const sources: PositionSource[] = [
      { ownerKind: caller.ownerKind, ownerId: caller.ownerId, ownedBy: 'you', agentId: null },
    ];
    if (caller.ownerKind === 'user') {
      const agents = await getAtelierAgentsByUser(caller.ownerId);
      for (const agent of agents) {
        sources.push({ ownerKind: 'agent', ownerId: agent.id, ownedBy: agent.name, agentId: agent.id });
      }
    }

    const configured = isAnyEarnConfigured();

    const data = (
      await Promise.all(
        sources.map(async (src) => {
          const positions = (await listPositionsByOwner(src.ownerKind, src.ownerId))
            .filter((p) => p.shares > BigInt(0));
          return Promise.all(
            positions.map(async (p) => {
              const vault = await getVaultById(p.vaultId);
              let valueUsd: string | null = null;
              if (configured && vault && vault.totalShares > BigInt(0)) {
                const { venue: venueId, market } = parseVenueKey(vault.poolMarket);
                const venue = tryGetVenue(venueId);
                if (venue && venue.isMarketEnabled(market)) {
                  const lp = computeLpForShares(vault, p.shares);
                  valueUsd = microToUsdString(await venue.valueUnits(market, lp));
                }
              }
              return {
                vault_id: p.vaultId,
                pool_market: vault?.poolMarket ?? null,
                shares: p.shares.toString(),
                principal_usd: microToUsdString(p.principalUsdc),
                value_usd: valueUsd,
                owned_by: src.ownedBy,
                agent_id: src.agentId,
              };
            }),
          );
        }),
      )
    ).flat();

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error('GET /api/earn/parquet/positions error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
