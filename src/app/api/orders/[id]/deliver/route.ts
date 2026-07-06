export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { getServiceOrderById, updateOrderStatus, createOrderDeliverable, updateOrderDeliverable, getOrderDeliverables, supersedeOrderDeliverables } from '@/lib/atelier-db';
import { AuthError } from '@/lib/atelier-auth';
import { authorizeOrderProvider } from '@/lib/order-auth';
import { rateLimiters } from '@/lib/rateLimit';
import { notifyBuyer } from '@/lib/notifications';
import { verifyDeliverable } from '@/lib/pod';
import { generateDeliverablePreview } from '@/lib/deliverable-preview';

const VALID_MEDIA_TYPES = ['image', 'video', 'link', 'document', 'code', 'text'] as const;
type MediaType = typeof VALID_MEDIA_TYPES[number];

// Resubmitting onto an already-delivered order guarantees the buyer at least this many
// hours to review the corrected file, without granting a fresh 48h on every resubmit.
const RESUBMIT_REVIEW_FLOOR_HOURS = 24;

interface DeliverableItem {
  deliverable_url: string;
  deliverable_media_type: MediaType;
}

function validateItem(item: unknown, index?: number): DeliverableItem | string {
  const prefix = index !== undefined ? `deliverables[${index}]: ` : '';
  const obj = item as Record<string, unknown>;

  if (!obj.deliverable_url || typeof obj.deliverable_url !== 'string') {
    return `${prefix}deliverable_url is required`;
  }
  let parsedUrl: URL;
  try { parsedUrl = new URL(obj.deliverable_url as string); } catch {
    return `${prefix}deliverable_url must be a valid URL`;
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return `${prefix}deliverable_url must use http or https`;
  }
  if (!obj.deliverable_media_type || !VALID_MEDIA_TYPES.includes(obj.deliverable_media_type as MediaType)) {
    return `${prefix}deliverable_media_type must be one of: ${VALID_MEDIA_TYPES.join(', ')}`;
  }
  return { deliverable_url: obj.deliverable_url as string, deliverable_media_type: obj.deliverable_media_type as MediaType };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimitResponse = rateLimiters.orders(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { id: orderId } = await params;

    const order = await getServiceOrderById(orderId);
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    const body = await request.json();
    const agent = await authorizeOrderProvider(request, body, order);

    // 'delivered' is included so an agent can resubmit a corrected file before the buyer
    // accepts (e.g. the first upload was wrong or broken). Once 'completed', payout has run.
    const DELIVERABLE_STATUSES = ['paid', 'in_progress', 'disputed', 'revision_requested', 'delivered'];
    if (!DELIVERABLE_STATUSES.includes(order.status)) {
      return NextResponse.json(
        { success: false, error: `Cannot deliver order with status "${order.status}". Must be one of: ${DELIVERABLE_STATUSES.join(', ')}.` },
        { status: 400 }
      );
    }

    // Normalize: accept single object or array via `deliverables` key
    let items: DeliverableItem[];
    if (Array.isArray(body.deliverables)) {
      if (body.deliverables.length === 0) {
        return NextResponse.json({ success: false, error: 'deliverables array cannot be empty' }, { status: 400 });
      }
      const validated: DeliverableItem[] = [];
      for (let i = 0; i < body.deliverables.length; i++) {
        const result = validateItem(body.deliverables[i], i);
        if (typeof result === 'string') {
          return NextResponse.json({ success: false, error: result }, { status: 400 });
        }
        validated.push(result);
      }
      items = validated;
    } else if (body.deliverable_url) {
      // Backward compat: single deliverable at top level
      const result = validateItem(body);
      if (typeof result === 'string') {
        return NextResponse.json({ success: false, error: result }, { status: 400 });
      }
      items = [result];
    } else {
      return NextResponse.json(
        { success: false, error: 'Provide either { deliverables: [...] } or { deliverable_url, deliverable_media_type }' },
        { status: 400 }
      );
    }

    // On resubmit (order already 'delivered'), capture the prior completed rows so we can
    // supersede them once the corrected set is in place, leaving only the latest in the gallery.
    const isResubmit = order.status === 'delivered';
    const supersededIds = isResubmit
      ? (await getOrderDeliverables(orderId)).filter((d) => d.status === 'completed').map((d) => d.id)
      : [];

    // Insert each deliverable into order_deliverables, generating a watermarked
    // low-res preview for image deliverables so the original stays hidden until accept.
    let primaryPreviewUrl: string | null = null;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const record = await createOrderDeliverable(orderId, '');
      const previewUrl = await generateDeliverablePreview(item.deliverable_url, item.deliverable_media_type, orderId);
      await updateOrderDeliverable(record.id, {
        status: 'completed',
        deliverable_url: item.deliverable_url,
        deliverable_media_type: item.deliverable_media_type,
        ...(previewUrl ? { preview_url: previewUrl } : {}),
      });
      if (i === 0) primaryPreviewUrl = previewUrl;
    }

    await supersedeOrderDeliverables(supersededIds);

    // Set primary deliverable on the order (first item) for backward compat
    const primary = items[0];
    const updated = await updateOrderStatus(orderId, {
      status: 'delivered',
      deliverable_url: primary.deliverable_url,
      deliverable_media_type: primary.deliverable_media_type,
      ...(primaryPreviewUrl ? { deliverable_preview_url: primaryPreviewUrl } : {}),
      ...(isResubmit ? { reviewDeadlineFloorHours: RESUBMIT_REVIEW_FLOOR_HOURS } : {}),
    });

    if (order.brief) {
      verifyDeliverable(order.brief, order.service_title || 'Service', items)
        .then((check) => {
          if (!check.matches && check.confidence >= 0.6) {
            console.warn(`Deliverable mismatch for order ${orderId} (confidence ${check.confidence}): ${check.reason}`);
          }
        })
        .catch((err) => console.error(`Deliverable verification failed for ${orderId}:`, err));
    }

    if (order.client_wallet) {
      notifyBuyer('order_delivered', {
        wallet: order.client_wallet,
        orderId,
        agentName: agent.name,
        serviceTitle: order.service_title || 'Service',
      });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error('POST /api/orders/[id]/deliver error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
