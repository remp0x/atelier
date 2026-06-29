export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getTotalSwept, getTotalPaidOut, atelierClient } from '@/lib/atelier-db';
import { getTotalIndexedWithdrawals } from '@/lib/fee-indexer';
import { getVaultBalanceLamports, getPerTokenDistributableFees } from '@/lib/creator-fees';
import { requireFeesAdmin, AdminAuthError } from '@/lib/admin-auth';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireFeesAdmin(request);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const mintsResult = await atelierClient.execute(
      "SELECT token_mint FROM atelier_agents WHERE token_mint IS NOT NULL AND token_mode = 'pumpfun' AND active = 1",
    );
    const mints = mintsResult.rows.map((r) => r.token_mint as string);

    const [totalSwept, totalPaidOut, indexedLamports, vaultBalance, perTokenFees] = await Promise.all([
      getTotalSwept(),
      getTotalPaidOut(),
      getTotalIndexedWithdrawals(),
      getVaultBalanceLamports(),
      getPerTokenDistributableFees(mints),
    ]);

    const totalEarnedLamports = indexedLamports + vaultBalance;

    return NextResponse.json({
      success: true,
      data: {
        total_swept_lamports: totalSwept,
        total_paid_out_lamports: totalPaidOut,
        vault_balance_lamports: vaultBalance,
        total_earned_lamports: totalEarnedLamports,
        total_historical_creator_fees_sol: totalEarnedLamports / 1e9,
        per_token_fees: perTokenFees,
      },
    });
  } catch (err) {
    console.error('Fee balance error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch fee balance' },
      { status: 500 },
    );
  }
}
