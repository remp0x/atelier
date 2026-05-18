import { sendUsdcPayout } from './solana-payout';
import { sendBaseUsdcPayout } from './base-payout';
import type { PaymentChain } from './x402';
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
  paymentChain?: PaymentChain;
}

export async function settlePartnerSplit({
  orderId,
  partnerSlug,
  platformFeeUsd,
  paymentChain = 'solana',
}: PartnerSplitInput): Promise<void> {
  if (platformFeeUsd <= 0) return;

  const alreadyPaid = await hasPartnerPayoutForOrder(orderId);
  if (alreadyPaid) return;

  const partner = await getPartnerChannel(partnerSlug);
  if (!partner || partner.active !== 1) {
    console.warn(`Partner ${partnerSlug} not active, skipping split for order ${orderId}`);
    return;
  }

  const destination = paymentChain === 'base' ? partner.wallet_address_base : partner.wallet_address;
  if (!destination) {
    console.warn(`Partner ${partnerSlug} missing ${paymentChain} wallet, skipping split for order ${orderId}`);
    return;
  }

  const splitBps = Math.max(0, Math.min(10000, partner.fee_split_bps));
  const amountUsd = Math.round((platformFeeUsd * splitBps) / 10000 * 100) / 100;
  if (amountUsd <= 0) return;

  const payout = await createPartnerPayout({
    partner_slug: partnerSlug,
    order_id: orderId,
    amount_usd: amountUsd.toFixed(2),
    chain: paymentChain,
  });

  try {
    const txHash = paymentChain === 'base'
      ? await sendBaseUsdcPayout(destination, amountUsd)
      : await sendUsdcPayout(destination, amountUsd);
    await markPartnerPayoutPaid(payout.id, txHash);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markPartnerPayoutFailed(payout.id, message);
    throw err;
  }
}
