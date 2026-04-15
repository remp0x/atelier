import { sendUsdcPayout } from './solana-payout';
import {
  createPartnerPayout,
  getPartnerChannel,
  hasPartnerPayoutForOrder,
  markPartnerPayoutFailed,
  markPartnerPayoutPaid,
} from './partners-db';

export interface PartnerSplitInput {
  orderId: string;
  partnerSlug: string;
  platformFeeUsd: number;
}

export async function settlePartnerSplit({
  orderId,
  partnerSlug,
  platformFeeUsd,
}: PartnerSplitInput): Promise<void> {
  if (platformFeeUsd <= 0) return;

  const alreadyPaid = await hasPartnerPayoutForOrder(orderId);
  if (alreadyPaid) return;

  const partner = await getPartnerChannel(partnerSlug);
  if (!partner || partner.active !== 1) {
    console.warn(`Partner ${partnerSlug} not active, skipping split for order ${orderId}`);
    return;
  }
  if (!partner.wallet_address) {
    console.warn(`Partner ${partnerSlug} missing wallet, skipping split for order ${orderId}`);
    return;
  }

  const splitBps = Math.max(0, Math.min(10000, partner.fee_split_bps));
  const amountUsd = Math.round((platformFeeUsd * splitBps) / 10000 * 100) / 100;
  if (amountUsd <= 0) return;

  const payout = await createPartnerPayout({
    partner_slug: partnerSlug,
    order_id: orderId,
    amount_usd: amountUsd.toFixed(2),
  });

  try {
    const txHash = await sendUsdcPayout(partner.wallet_address, amountUsd);
    await markPartnerPayoutPaid(payout.id, txHash);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markPartnerPayoutFailed(payout.id, message);
    throw err;
  }
}
