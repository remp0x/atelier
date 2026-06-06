import { sendUsdcPayout } from './solana-payout';
import { sendBaseUsdcPayout } from './base-payout';
import { verifySolanaUsdcPayment } from './solana-verify';
import { verifyBaseUsdcPayment } from './base-verify';
import { tryClaimEscrowRefund, releaseEscrowRefund, recordEscrowRefundTx } from './atelier-db';

export type EscrowChain = 'solana' | 'base';

const BASE_TX_RE = /^0x[a-fA-F0-9]{64}$/;

export function escrowAmountForBudget(budgetUsd: string | number): number {
  const budget = typeof budgetUsd === 'number' ? budgetUsd : parseFloat(budgetUsd);
  return Math.round(budget * 1.10 * 1e6) / 1e6;
}

export async function verifyEscrowLanded(args: {
  chain: EscrowChain;
  txHash: string;
  payer: string;
  amountUsd: number;
}): Promise<{ verified: boolean; error?: string }> {
  if (args.chain === 'base') {
    if (!BASE_TX_RE.test(args.txHash)) {
      return { verified: false, error: 'Invalid Base transaction hash format' };
    }
    return verifyBaseUsdcPayment(args.txHash as `0x${string}`, args.payer, args.amountUsd);
  }
  return verifySolanaUsdcPayment(args.txHash, args.payer, args.amountUsd);
}

// Sends USDC from the Atelier treasury back to the payer. The treasury is the
// escrow recipient, so a refund is just a treasury payout in the opposite
// direction -- it reuses the same payout primitives as agent settlements.
export async function refundEscrowPayment(
  chain: EscrowChain,
  recipient: string,
  amountUsd: number,
): Promise<string> {
  return chain === 'base'
    ? sendBaseUsdcPayout(recipient, amountUsd)
    : sendUsdcPayout(recipient, amountUsd);
}

export interface RefundOnceResult {
  refunded: boolean;
  refundTx?: string;
  reason?: 'already_refunded';
}

// Refunds an escrow payment at most once per on-chain tx. The escrow tx hash is
// claimed in the ledger before any funds move; a duplicate caller gets
// `already_refunded` and no second transfer. If the transfer itself fails the
// claim is released so the refund can be retried.
export async function refundEscrowOnce(args: {
  chain: EscrowChain;
  escrowTxHash: string;
  recipient: string;
  amountUsd: number;
}): Promise<RefundOnceResult> {
  const claimed = await tryClaimEscrowRefund(args.escrowTxHash);
  if (!claimed) {
    return { refunded: false, reason: 'already_refunded' };
  }
  try {
    const refundTx = await refundEscrowPayment(args.chain, args.recipient, args.amountUsd);
    await recordEscrowRefundTx(args.escrowTxHash, refundTx);
    return { refunded: true, refundTx };
  } catch (err) {
    await releaseEscrowRefund(args.escrowTxHash);
    throw err;
  }
}
