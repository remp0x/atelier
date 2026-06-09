export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { isParquetEarnConfigured, getEnabledMarkets } from '@/lib/parquet-earn';
import { getEarnTreasuryPubkey } from '@/lib/parquet-earn-treasury';

const marketsRateLimit = rateLimit(120, 60 * 1000);

// Public: the list of markets enabled for Earn deposits, so the grid knows which
// pools are live vs coming-soon. Lightweight (no on-chain reads); per-pool live
// stats are loaded from /pools?market= when a pool is selected.
export async function GET(request: NextRequest) {
  const limited = marketsRateLimit(request);
  if (limited) return limited;

  if (!isParquetEarnConfigured()) {
    return NextResponse.json({ success: false, error: 'Parquet Earn is not configured' }, { status: 503 });
  }

  let treasuryWallet: string | null = null;
  try {
    treasuryWallet = getEarnTreasuryPubkey().toBase58();
  } catch {
    treasuryWallet = null;
  }

  return NextResponse.json({
    success: true,
    data: {
      treasury_wallet: treasuryWallet,
      enabled: getEnabledMarkets(),
    },
  });
}
