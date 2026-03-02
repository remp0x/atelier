export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { OnlinePumpSdk } from '@pump-fun/pump-sdk';
import { getMetricsData } from '@/lib/atelier-db';
import { getServerConnection, ATELIER_PUBKEY } from '@/lib/solana-server';
import { getSolPriceUsd } from '@/lib/sol-price';

const BASELINE_LAMPORTS = Number(process.env.CREATOR_FEE_BASELINE_LAMPORTS ?? '0');

export const revalidate = 60;

export async function GET(): Promise<NextResponse> {
  try {
    const connection = getServerConnection();
    const sdk = new OnlinePumpSdk(connection);

    const [data, vaultBalance, solPrice] = await Promise.all([
      getMetricsData(),
      sdk.getCreatorVaultBalanceBothPrograms(ATELIER_PUBKEY),
      getSolPriceUsd(),
    ]);

    data.creatorFeeSol += (BASELINE_LAMPORTS + vaultBalance.toNumber()) / 1e9;

    return NextResponse.json({ success: true, data: { ...data, solPrice } });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to fetch metrics' }, { status: 500 });
  }
}
