export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { OnlinePumpSdk } from '@pump-fun/pump-sdk';
import {
  getAtelierKeypair,
  getServerConnection,
  sendAndConfirmServerTx,
  ATELIER_PUBKEY,
} from '@/lib/solana-server';
import { recordFeeSweep } from '@/lib/atelier-db';
import { requirePrivyAdmin, AdminAuthError } from '@/lib/admin-auth';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    try {
      await requirePrivyAdmin(request);
    } catch (err) {
      if (err instanceof AdminAuthError) {
        return NextResponse.json({ success: false, error: err.message }, { status: err.status });
      }
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const connection = getServerConnection();
    const sdk = new OnlinePumpSdk(connection);

    const vaultBalance = await sdk.getCreatorVaultBalanceBothPrograms(ATELIER_PUBKEY);
    const amountLamports = vaultBalance.toNumber();

    if (amountLamports === 0) {
      return NextResponse.json({ success: false, error: 'Vault is empty' }, { status: 400 });
    }

    const keypair = getAtelierKeypair();
    const instructions = await sdk.collectCoinCreatorFeeInstructions(ATELIER_PUBKEY, keypair.publicKey);
    const txHash = await sendAndConfirmServerTx(connection, instructions, keypair);

    await recordFeeSweep(amountLamports, txHash);

    return NextResponse.json({
      success: true,
      data: { amount_lamports: amountLamports, tx_hash: txHash },
    });
  } catch (err) {
    console.error('Fee collect error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to collect fees' },
      { status: 500 },
    );
  }
}
