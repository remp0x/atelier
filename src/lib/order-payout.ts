import 'server-only';
import { sendUsdcPayout } from './solana-payout';
import { sendBaseUsdcPayout } from './base-payout';
import {
  getAtelierAgent,
  getPayoutWallet,
  updateOrderStatus,
  type AtelierAgent,
  type ServiceOrder,
  type OrderStatus,
} from './atelier-db';
import type { PaymentChain } from './x402';

/**
 * Where an agent's provider payout lands on a given chain. The chain is dictated
 * by the order's payment_chain (the currency the buyer actually paid in), never
 * the agent's stored payout_chain preference: paying out on a different chain
 * than the buyer paid both strands the buyer's funds on the wrong treasury and
 * can send to an address that does not exist on the target network.
 */
export function resolveAgentPayoutDestination(agent: AtelierAgent, chain: PaymentChain): string | null {
  if (chain === 'base') {
    if (agent.payout_address_base) return agent.payout_address_base;
    if (agent.payout_chain === 'base') return agent.payout_wallet || agent.owner_wallet || null;
    return null;
  }
  return getPayoutWallet(agent);
}

/**
 * The provider's net for an order. The two payment models book the platform fee
 * differently:
 *  - x402 (`client_type === 'agent_x402'`): the fee is charged on top of the
 *    listed price (buyer pays quoted + fee), so the provider nets the full
 *    quoted price.
 *  - escrow/wallet: the fee is taken out of the listed price (buyer pays
 *    quoted), so the provider nets quoted - fee.
 */
export function orderProviderNetUsd(order: ServiceOrder): number {
  const quoted = parseFloat(order.quoted_price_usd || '0');
  if (order.client_type === 'agent_x402') {
    return Math.round(quoted * 100) / 100;
  }
  const fee = parseFloat(order.platform_fee_usd || '0');
  return Math.round((quoted - fee) * 100) / 100;
}

export type OrderPayoutOutcome =
  | { kind: 'paid'; chain: PaymentChain; destination: string; amountUsd: number; txHash: string }
  | { kind: 'already_paid'; txHash: string }
  | { kind: 'nothing_to_pay'; amountUsd: number }
  | { kind: 'no_destination'; chain: PaymentChain; amountUsd: number; reason: string }
  | { kind: 'failed'; chain: PaymentChain; destination: string; amountUsd: number; error: string };

export function isOrderPayoutSettled(outcome: OrderPayoutOutcome): boolean {
  return outcome.kind === 'paid' || outcome.kind === 'already_paid';
}

/**
 * Idempotently pay the provider their net for an order. Resolves the chain from
 * the order's payment_chain, refuses to double-pay when payout_tx_hash is
 * already set, and persists the payout tx hash (under finalStatus) on success.
 * Never throws on a payout failure -- it returns a structured outcome so callers
 * can surface the reason and leave the order recoverable via retry.
 */
export async function payOrderProvider(
  order: ServiceOrder,
  opts: { finalStatus: OrderStatus; agent?: AtelierAgent | null },
): Promise<OrderPayoutOutcome> {
  if (order.payout_tx_hash) {
    return { kind: 'already_paid', txHash: order.payout_tx_hash };
  }

  const amountUsd = orderProviderNetUsd(order);
  if (amountUsd <= 0) {
    return { kind: 'nothing_to_pay', amountUsd };
  }

  const chain: PaymentChain = order.payment_chain === 'base' ? 'base' : 'solana';
  const agent = opts.agent ?? (await getAtelierAgent(order.provider_agent_id));
  if (!agent) {
    return { kind: 'no_destination', chain, amountUsd, reason: `agent ${order.provider_agent_id} not found` };
  }

  const destination = resolveAgentPayoutDestination(agent, chain);
  if (!destination) {
    return { kind: 'no_destination', chain, amountUsd, reason: `agent has no ${chain} payout wallet configured` };
  }

  try {
    const txHash = chain === 'base'
      ? await sendBaseUsdcPayout(destination, amountUsd)
      : await sendUsdcPayout(destination, amountUsd);
    await updateOrderStatus(order.id, { status: opts.finalStatus, payout_tx_hash: txHash });
    return { kind: 'paid', chain, destination, amountUsd, txHash };
  } catch (err) {
    const error = err instanceof Error ? (err.message || err.toString()) : String(err);
    console.error(`Provider payout failed for order ${order.id}:`, error);
    return { kind: 'failed', chain, destination, amountUsd, error };
  }
}
