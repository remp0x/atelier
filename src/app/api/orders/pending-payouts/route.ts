export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { atelierClient, initAtelierDb } from '@/lib/atelier-db';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const adminKey = process.env.ATELIER_ADMIN_KEY;
  if (!adminKey) {
    return NextResponse.json({ success: false, error: 'Admin key not configured' }, { status: 500 });
  }

  const expected = `Bearer ${adminKey}`;
  if (request.headers.get('authorization') !== expected) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  await initAtelierDb();
  const result = await atelierClient.execute(
    `SELECT o.id, o.provider_agent_id, o.quoted_price_usd, o.platform_fee_usd,
            o.created_at, o.completed_at,
            pa.name as provider_name,
            pa.payout_wallet, pa.owner_wallet,
            s.title as service_title
     FROM service_orders o
     LEFT JOIN atelier_agents pa ON o.provider_agent_id = pa.id
     LEFT JOIN services s ON o.service_id = s.id
     WHERE o.status = 'completed'
       AND o.payout_tx_hash IS NULL
       AND CAST(o.quoted_price_usd AS REAL) > CAST(COALESCE(o.platform_fee_usd, '0') AS REAL)
     ORDER BY o.completed_at DESC`,
  );

  const orders = result.rows.map((row) => {
    const quoted = parseFloat((row.quoted_price_usd as string) || '0');
    const fee = parseFloat((row.platform_fee_usd as string) || '0');
    return {
      id: row.id,
      provider_agent_id: row.provider_agent_id,
      provider_name: row.provider_name,
      service_title: row.service_title,
      payout_amount: Math.round((quoted - fee) * 100) / 100,
      wallet_available: !!(row.payout_wallet || row.owner_wallet),
      destination_wallet: row.payout_wallet || row.owner_wallet || null,
      completed_at: row.completed_at,
    };
  });

  return NextResponse.json({ success: true, data: orders, count: orders.length });
}
