export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServicesMissingBriefPlaceholder, setServiceBriefPlaceholder } from '@/lib/atelier-db';
import { generateBriefPlaceholder } from '@/lib/pod';
import { requirePrivyAdmin, AdminAuthError } from '@/lib/admin-auth';

const BATCH_LIMIT = 25;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await requirePrivyAdmin(req);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pending = await getServicesMissingBriefPlaceholder(BATCH_LIMIT);
    let processed = 0;

    for (const svc of pending) {
      const placeholder = await generateBriefPlaceholder(svc.title, svc.description, svc.category);
      if (placeholder) {
        await setServiceBriefPlaceholder(svc.id, placeholder);
        processed++;
      }
    }

    const remaining = await getServicesMissingBriefPlaceholder(1);

    return NextResponse.json({
      success: true,
      data: { processed, remaining: remaining.length > 0 },
    });
  } catch (err) {
    console.error('Brief placeholder backfill failed:', err);
    return NextResponse.json({ success: false, error: 'Backfill failed' }, { status: 500 });
  }
}
