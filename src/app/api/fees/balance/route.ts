import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { OnlinePumpSdk } from '@pump-fun/pump-sdk';
import { getServerConnection, ATELIER_PUBKEY } from '@/lib/solana-server';
import { getTotalSwept, getTotalPaidOut } from '@/lib/atelier-db';

function verifyAdminKey(request: NextRequest): NextResponse | null {
  const adminKey = process.env.ATELIER_ADMIN_KEY;
  if (!adminKey) {
    return NextResponse.json({ success: false, error: 'Admin key not configured' }, { status: 500 });
  }
  const auth = request.headers.get('Authorization') || '';
  const expected = `Bearer ${adminKey}`;
  if (auth.length !== expected.length || !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authError = verifyAdminKey(request);
  if (authError) return authError;

  try {
    const connection = getServerConnection();
    const sdk = new OnlinePumpSdk(connection);

    const [vaultBalance, totalSwept, totalPaidOut] = await Promise.all([
      sdk.getCreatorVaultBalanceBothPrograms(ATELIER_PUBKEY),
      getTotalSwept(),
      getTotalPaidOut(),
    ]);

    const vaultLamports = vaultBalance.toNumber();

    return NextResponse.json({
      success: true,
      data: {
        vault_balance_lamports: vaultLamports,
        vault_balance_sol: vaultLamports / 1e9,
        total_swept_lamports: totalSwept,
        total_paid_out_lamports: totalPaidOut,
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
