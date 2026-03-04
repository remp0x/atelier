export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { OnlinePumpSdk } from '@pump-fun/pump-sdk';
import { getMetricsData } from '@/lib/atelier-db';
import { getTotalIndexedWithdrawals } from '@/lib/fee-indexer';
import { getServerConnection, ATELIER_PUBKEY } from '@/lib/solana-server';
import { getSolPriceUsd } from '@/lib/sol-price';

export const revalidate = 60;

export async function GET(): Promise<NextResponse> {
  try {
    const connection = getServerConnection();
    const sdk = new OnlinePumpSdk(connection);

    const [data, vaultBalance, indexedWithdrawals, solPrice] = await Promise.all([
      getMetricsData(),
      sdk.getCreatorVaultBalanceBothPrograms(ATELIER_PUBKEY),
      getTotalIndexedWithdrawals(),
      getSolPriceUsd(),
    ]);

    data.creatorFeeSol = (indexedWithdrawals + vaultBalance.toNumber()) / 1e9;

    return NextResponse.json({ success: true, data: { ...data, solPrice } });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to fetch metrics' }, { status: 500 });
  }
}
