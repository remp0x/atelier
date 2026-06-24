import {
  type ServiceOrder,
  getAtelierAgent,
  getPayoutWallet,
  updateOrderStatus,
  atomicStatusTransition,
  completeBountyByOrderId,
} from './atelier-db';
import { sendUsdcPayout } from './solana-payout';
import { sendBaseUsdcPayout } from './base-payout';
import { settlePartnerSplit } from './partner-settlement';
import { notifyAgentWebhook } from './webhook';

export interface OrderCompletionResult {
  claimed: boolean;
  agentPaid: boolean;
  payoutFailed: boolean;
}

/**
 * Move an order from its current status to `completed` and release the provider
 * payout. The single source of truth for order completion -- shared by the buyer
 * `approve` action and the auto-release cron so both behave identically.
 *
 * The status flip is an atomic compare-and-set on the order's current status, so
 * concurrent callers (a buyer approving while the cron runs) cannot double-pay:
 * the loser sees `claimed: false` and does nothing. The payout itself only runs
 * after the caller has won the transition.
 */
export async function completeOrderWithPayout(order: ServiceOrder): Promise<OrderCompletionResult> {
  const id = order.id;

  const claimed = await atomicStatusTransition(id, order.status, 'completed');
  if (!claimed) {
    return { claimed: false, agentPaid: false, payoutFailed: false };
  }

  const quotedPrice = parseFloat(order.quoted_price_usd || '0');
  const platformFee = parseFloat(order.platform_fee_usd || '0');
  const payoutAmount = Math.round((quotedPrice - platformFee) * 100) / 100;
  let payoutFailed = false;
  let agentPaid = false;

  if (payoutAmount > 0) {
    try {
      const agent = await getAtelierAgent(order.provider_agent_id);
      if (!agent) {
        payoutFailed = true;
        console.error(`Payout skipped for order ${id}: agent ${order.provider_agent_id} not found`);
      } else if (agent.payout_chain === 'base') {
        const destination = agent.payout_address_base;
        if (destination) {
          const txHash = await sendBaseUsdcPayout(destination, payoutAmount);
          await updateOrderStatus(id, { status: 'completed', payout_tx_hash: txHash });
          agentPaid = true;
        } else {
          payoutFailed = true;
          console.error(`Payout skipped for order ${id}: agent has no Base payout address configured`);
        }
      } else {
        const destination = getPayoutWallet(agent);
        if (destination) {
          const txHash = await sendUsdcPayout(destination, payoutAmount);
          await updateOrderStatus(id, { status: 'completed', payout_tx_hash: txHash });
          agentPaid = true;
        } else {
          payoutFailed = true;
          console.error(`Payout skipped for order ${id}: no destination wallet`);
        }
      }
    } catch (payoutErr) {
      payoutFailed = true;
      console.error(`Payout failed for order ${id}:`, payoutErr);
    }
  }

  if (order.bounty_id) {
    await completeBountyByOrderId(id).catch((err) =>
      console.error(`Failed to mark bounty completed for order ${id}:`, err),
    );
  }

  if (agentPaid && order.referral_partner && platformFee > 0) {
    settlePartnerSplit({
      orderId: id,
      partnerSlug: order.referral_partner,
      platformFeeUsd: platformFee,
      paymentChain: order.payment_chain || 'solana',
    }).catch((err) => {
      console.error(`Partner settlement failed for order ${id}:`, err);
    });
  }

  notifyAgentWebhook(order.provider_agent_id, {
    event: 'order.completed',
    order_id: id,
    data: { payout_failed: payoutFailed },
  });

  return { claimed: true, agentPaid, payoutFailed };
}
