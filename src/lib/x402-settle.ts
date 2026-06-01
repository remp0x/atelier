import { sendUsdcPayout } from './solana-payout';
import { sendBaseUsdcPayout } from './base-payout';
import {
  getAtelierAgent,
  getPayoutWallet,
  updateOrderStatus,
  type AtelierAgent,
} from './atelier-db';
import type { PaymentChain } from './x402';

export interface X402PayoutResult {
  attempted: boolean;
  paid: boolean;
  amountUsd: number;
  txHash: string | null;
  destination: string | null;
  chain: PaymentChain;
  error?: string;
}

export function hasX402PayoutDestination(agent: AtelierAgent, chain: PaymentChain): boolean {
  if (chain === 'base') {
    return typeof agent.payout_address_base === 'string' && agent.payout_address_base.length > 0;
  }
  const solana = getPayoutWallet(agent);
  return typeof solana === 'string' && solana.length > 0;
}

function resolveDestination(agent: AtelierAgent, chain: PaymentChain): string | null {
  if (chain === 'base') {
    if (agent.payout_address_base) return agent.payout_address_base;
    if (agent.payout_chain === 'base') return agent.payout_wallet || agent.owner_wallet || null;
    return null;
  }
  return getPayoutWallet(agent);
}

export async function settleX402ProviderPayout(params: {
  orderId: string;
  providerAgentId: string;
  providerNetUsd: number;
  paymentChain: PaymentChain;
}): Promise<X402PayoutResult> {
  const { orderId, providerAgentId, providerNetUsd, paymentChain } = params;

  if (providerNetUsd <= 0) {
    return { attempted: false, paid: false, amountUsd: 0, txHash: null, destination: null, chain: paymentChain };
  }

  const agent = await getAtelierAgent(providerAgentId);
  if (!agent) {
    return {
      attempted: false,
      paid: false,
      amountUsd: providerNetUsd,
      txHash: null,
      destination: null,
      chain: paymentChain,
      error: `agent ${providerAgentId} not found`,
    };
  }

  const destination = resolveDestination(agent, paymentChain);
  if (!destination) {
    return {
      attempted: false,
      paid: false,
      amountUsd: providerNetUsd,
      txHash: null,
      destination: null,
      chain: paymentChain,
      error: `agent ${providerAgentId} has no ${paymentChain} payout wallet configured`,
    };
  }

  const amount = Math.round(providerNetUsd * 100) / 100;

  try {
    const txHash = paymentChain === 'base'
      ? await sendBaseUsdcPayout(destination, amount)
      : await sendUsdcPayout(destination, amount);

    await updateOrderStatus(orderId, { status: 'paid', payout_tx_hash: txHash });

    return { attempted: true, paid: true, amountUsd: amount, txHash, destination, chain: paymentChain };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`x402 provider payout failed for order ${orderId}:`, message);
    return { attempted: true, paid: false, amountUsd: amount, txHash: null, destination, chain: paymentChain, error: message };
  }
}
