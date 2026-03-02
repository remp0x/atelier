export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { OnlinePumpSdk } from '@pump-fun/pump-sdk';
import { getPlatformStats, getPlatformRevenue, getTotalSwept } from '@/lib/atelier-db';
import { getServerConnection, ATELIER_PUBKEY } from '@/lib/solana-server';

export async function GET(): Promise<NextResponse> {
  try {
    const connection = getServerConnection();
    const sdk = new OnlinePumpSdk(connection);

    const [stats, revenue, vaultBalance, sweptLamports] = await Promise.all([
      getPlatformStats(),
      getPlatformRevenue(),
      sdk.getCreatorVaultBalanceBothPrograms(ATELIER_PUBKEY),
      getTotalSwept(),
    ]);

    const totalCreatorFeeLamports = vaultBalance.toNumber() + sweptLamports;

    return NextResponse.json({
      success: true,
      data: {
        atelierAgents: stats.agents,
        orders: stats.orders,
        revenue,
        creatorFeeSol: totalCreatorFeeLamports / 1e9,
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to fetch stats' }, { status: 500 });
  }
}
