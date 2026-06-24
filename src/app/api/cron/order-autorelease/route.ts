export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getDeliveredOrdersPastReviewDeadline } from '@/lib/atelier-db';
import { completeOrderWithPayout } from '@/lib/order-completion';

export const maxDuration = 300;

const BATCH_LIMIT = 200;

function netPayout(quoted: string | null, fee: string | null): number {
  return Math.round((parseFloat(quoted || '0') - parseFloat(fee || '0')) * 100) / 100;
}

// Auto-release: orders left in `delivered` past their 48h review_deadline complete and pay out the
// provider, exactly as if the buyer had approved. completeOrderWithPayout flips status atomically,
// so a buyer approving concurrently can never double-pay. Pass ?dry=1 to preview without releasing.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ success: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization') || '';
  const expected = `Bearer ${cronSecret}`;
  if (authHeader.length !== expected.length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = ['1', 'true'].includes((request.nextUrl.searchParams.get('dry') || '').toLowerCase());

  try {
    const orders = await getDeliveredOrdersPastReviewDeadline(BATCH_LIMIT);

    if (dryRun) {
      const preview = orders.map((o) => ({
        id: o.id,
        provider_agent_id: o.provider_agent_id,
        net_usd: netPayout(o.quoted_price_usd, o.platform_fee_usd),
        review_deadline: o.review_deadline,
        bounty_id: o.bounty_id,
      }));
      const totalUsd = Math.round(preview.reduce((sum, p) => sum + p.net_usd, 0) * 100) / 100;
      return NextResponse.json({
        success: true,
        dry_run: true,
        data: { candidates: preview.length, total_net_usd: totalUsd, orders: preview },
      });
    }

    let paid = 0;
    let payoutFailed = 0;
    let skippedRace = 0;
    let totalPaidUsd = 0;

    for (const order of orders) {
      const result = await completeOrderWithPayout(order);
      if (!result.claimed) {
        skippedRace += 1;
        continue;
      }
      if (result.agentPaid) {
        paid += 1;
        totalPaidUsd += netPayout(order.quoted_price_usd, order.platform_fee_usd);
      }
      if (result.payoutFailed) {
        payoutFailed += 1;
      }
    }

    totalPaidUsd = Math.round(totalPaidUsd * 100) / 100;
    console.log(
      `[order-autorelease cron] candidates=${orders.length} paid=${paid} payout_failed=${payoutFailed} skipped_race=${skippedRace} total_paid_usd=${totalPaidUsd}`,
    );
    return NextResponse.json({
      success: true,
      data: { candidates: orders.length, paid, payout_failed: payoutFailed, skipped_race: skippedRace, total_paid_usd: totalPaidUsd },
    });
  } catch (err) {
    console.error('[order-autorelease cron] failed:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'failed' },
      { status: 500 },
    );
  }
}
