export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { AuthError } from '@/lib/atelier-auth';
import { requirePrivyAdmin, AdminAuthError } from '@/lib/admin-auth';
import { resolveEarnCaller, earnRateLimit, parseUsdToMicro, microToUsdString } from '@/lib/earn-auth';
import { isParquetEarnConfigured, isMarketEnabled, getDefaultMarket } from '@/lib/parquet-earn';
import { isEarnDepositsOpen } from '@/lib/earn-access';
import { depositFromTransfer, initiateManagedAgentDeposit } from '@/lib/parquet-earn-flows';

// Deposit into a Parquet Earn pool. Two modes:
//  - Push (default): the caller sends USDC to the treasury and passes that
//    transfer signature as `incoming_tx_hash`; the server verifies and deploys.
//  - Auto-pull (agents): an agent caller with a Privy server wallet may omit
//    `incoming_tx_hash`; the server pulls USDC from the agent's wallet itself,
//    then runs the identical verify/deploy/refund path. One call, no client sig.
export async function POST(request: NextRequest) {
  try {
    if (!isParquetEarnConfigured()) {
      return NextResponse.json({ success: false, error: 'Parquet Earn is not configured' }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    // Deposits are admin-only until explicitly opened (EARN_DEPOSITS_OPEN=true).
    // The page-visibility flag (EARN_PUBLIC) deliberately does NOT open deposits.
    if (!isEarnDepositsOpen()) await requirePrivyAdmin(request, body);
    const caller = await resolveEarnCaller(request, body);
    const limited = earnRateLimit(`earn:${caller.ownerId}`);
    if (limited) return limited;

    const market = typeof body.market === 'string' && body.market.trim() ? body.market.trim() : getDefaultMarket();
    if (!isMarketEnabled(market)) {
      return NextResponse.json({ success: false, error: `market "${market}" is not enabled for Earn` }, { status: 400 });
    }

    const amountUsdc = parseUsdToMicro(body.amount_usd);
    const incomingTxHash = typeof body.incoming_tx_hash === 'string' ? body.incoming_tx_hash.trim() : '';
    const slippageBps = typeof body.slippage_bps === 'number' ? body.slippage_bps : undefined;
    const canAutoPull = caller.ownerKind === 'agent' && !!caller.agent?.privy_solana_wallet_id;

    let result;
    if (incomingTxHash) {
      result = await depositFromTransfer({
        market,
        ownerKind: caller.ownerKind,
        ownerId: caller.ownerId,
        amountUsdc,
        incomingTxHash,
        slippageBps,
      });
    } else if (canAutoPull) {
      result = await initiateManagedAgentDeposit({
        market,
        agentId: caller.ownerId,
        privySolanaWalletId: caller.agent!.privy_solana_wallet_id!,
        amountUsdc,
        slippageBps,
      });
    } else {
      return NextResponse.json(
        { success: false, error: 'incoming_tx_hash required: send USDC to the Earn treasury and pass the transfer signature (or use an agent wallet for auto-pull)' },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        market,
        tx_hash: result.txHash,
        shares_minted: result.sharesMinted.toString(),
        lp_minted: result.lpMinted.toString(),
        position: {
          shares: result.position.shares.toString(),
          principal_usd: microToUsdString(result.position.principalUsdc),
        },
      },
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error('POST /api/earn/parquet/deposit error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
