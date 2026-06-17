export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { atelierClient, initAtelierDb } from '@/lib/atelier-db';
import { requirePrivyAdmin, AdminAuthError } from '@/lib/admin-auth';

// Mirror resolveAgentPayoutDestination / getPayoutWallet against a raw joined
// row, keyed on the chain the buyer paid (o.payment_chain), not the agent's
// stored preference.
function resolveRowDestination(row: Record<string, unknown>): string | null {
  const chain = row.payment_chain === 'base' ? 'base' : 'solana';
  const base = (row.payout_address_base as string | null) || null;
  const solana = (row.payout_wallet as string | null) || (row.owner_wallet as string | null) || null;
  const prefersBase = row.payout_chain === 'base';
  if (chain === 'base') {
    if (base) return base;
    return prefersBase ? solana : null;
  }
  return prefersBase ? base : solana;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePrivyAdmin(request);
  } catch (err) {
    const status = err instanceof AdminAuthError ? err.status : 401;
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ success: false, error: message }, { status });
  }

  await initAtelierDb();
  const result = await atelierClient.execute(
    `SELECT o.id, o.provider_agent_id, o.quoted_price_usd, o.platform_fee_usd,
            o.client_type, o.payment_chain, o.status,
            o.created_at, o.completed_at, o.escrow_tx_hash,
            pa.name as provider_name,
            pa.payout_wallet, pa.owner_wallet, pa.payout_chain, pa.payout_address_base,
            s.title as service_title
     FROM service_orders o
     LEFT JOIN atelier_agents pa ON o.provider_agent_id = pa.id
     LEFT JOIN services s ON o.service_id = s.id
     WHERE o.status IN ('paid', 'delivered', 'completed')
       AND o.payout_tx_hash IS NULL
       AND CAST(o.quoted_price_usd AS REAL) > 0
     ORDER BY o.created_at DESC`,
  );

  const orders = result.rows.map((row) => {
    const quoted = parseFloat((row.quoted_price_usd as string) || '0');
    const fee = parseFloat((row.platform_fee_usd as string) || '0');
    // x402 charges the fee on top (provider nets the full price); escrow takes
    // the fee out of the price.
    const amount = row.client_type === 'agent_x402'
      ? Math.round(quoted * 100) / 100
      : Math.round((quoted - fee) * 100) / 100;
    const chain = row.payment_chain === 'base' ? 'base' : 'solana';
    const destination = resolveRowDestination(row as Record<string, unknown>);
    return {
      id: row.id,
      provider_agent_id: row.provider_agent_id,
      provider_name: row.provider_name,
      service_title: row.service_title,
      status: row.status,
      payout_amount: amount,
      payout_chain: chain,
      wallet_available: !!destination,
      destination_wallet: destination,
      escrow_funded: !!row.escrow_tx_hash,
      created_at: row.created_at,
      completed_at: row.completed_at,
    };
  });

  return NextResponse.json({ success: true, data: orders, count: orders.length });
}
