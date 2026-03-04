export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { OnlinePumpSdk } from '@pump-fun/pump-sdk';
import { getPlatformStats, getPlatformRevenue } from '@/lib/atelier-db';
import { getTotalIndexedWithdrawals } from '@/lib/fee-indexer';
import { getServerConnection, ATELIER_PUBKEY } from '@/lib/solana-server';
import { getSolPriceUsd } from '@/lib/sol-price';

export async function GET(): Promise<NextResponse> {
  try {
    const connection = getServerConnection();
    const sdk = new OnlinePumpSdk(connection);

    const [stats, revenue, vaultBalance, indexedWithdrawals, solPrice] = await Promise.all([
      getPlatformStats(),
      getPlatformRevenue(),
      sdk.getCreatorVaultBalanceBothPrograms(ATELIER_PUBKEY),
      getTotalIndexedWithdrawals(),
      getSolPriceUsd(),
    ]);

    const creatorFeeSol = (indexedWithdrawals + vaultBalance.toNumber()) / 1e9;
    const creatorFeeUsd = creatorFeeSol * solPrice;
    const totalRevenueUsd = revenue + creatorFeeUsd;

    return NextResponse.json({
      success: true,
      data: {
        atelierAgents: stats.agents,
        orders: stats.orders,
        revenue,
        creatorFeeSol,
        creatorFeeUsd,
        totalRevenueUsd,
        solPrice,
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to fetch stats' }, { status: 500 });
  }
}
