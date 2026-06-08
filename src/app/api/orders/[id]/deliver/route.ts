export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceOrderById, updateOrderStatus, createOrderDeliverable, updateOrderDeliverable } from '@/lib/atelier-db';
import { AuthError } from '@/lib/atelier-auth';
import { authorizeOrderProvider } from '@/lib/order-auth';
import { rateLimiters } from '@/lib/rateLimit';
import { notifyBuyer } from '@/lib/notifications';
import { verifyDeliverable } from '@/lib/pod';

const VALID_MEDIA_TYPES = ['image', 'video', 'link', 'document', 'code', 'text'] as const;
type MediaType = typeof VALID_MEDIA_TYPES[number];

interface DeliverableItem {
  deliverable_url: string;
  deliverable_media_type: MediaType;
}

const CONTENT_TYPE_RULES: ReadonlyArray<readonly [RegExp, MediaType]> = [
  [/^image\//, 'image'],
  [/^video\//, 'video'],
  [/^text\/html\b/, 'link'],
  [/^application\/pdf\b/, 'document'],
  [/^application\/(json|xml|.*javascript)\b/, 'code'],
  [/^text\/(javascript|css|x-)/, 'code'],
  [/^text\/(plain|markdown)\b/, 'text'],
];

async function detectMediaType(url: string, fallback: MediaType): Promise<MediaType> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
    if (!res.ok || !res.headers.get('content-type')) {
      res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
      res.body?.cancel().catch(() => {});
    }
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!contentType) return fallback;
    for (const [pattern, type] of CONTENT_TYPE_RULES) {
      if (pattern.test(contentType)) return type;
    }
    return fallback;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}

function validateItem(item: unknown, index?: number): DeliverableItem | string {
  const prefix = index !== undefined ? `deliverables[${index}]: ` : '';
  const obj = item as Record<string, unknown>;

  if (!obj.deliverable_url || typeof obj.deliverable_url !== 'string') {
    return `${prefix}deliverable_url is required`;
  }
  try { new URL(obj.deliverable_url as string); } catch {
    return `${prefix}deliverable_url must be a valid URL`;
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

    const DELIVERABLE_STATUSES = ['paid', 'in_progress', 'disputed', 'revision_requested'];
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

    // Correct the media type from the actual content-type so a mislabeled
    // deliverable still renders/downloads correctly. Best-effort: keep the
    // agent-provided type if detection fails or times out.
    items = await Promise.all(
      items.map(async (item) => ({
        deliverable_url: item.deliverable_url,
        deliverable_media_type: await detectMediaType(item.deliverable_url, item.deliverable_media_type),
      })),
    );

    // Insert each deliverable into order_deliverables
    for (const item of items) {
      const record = await createOrderDeliverable(orderId, '');
      await updateOrderDeliverable(record.id, {
        status: 'completed',
        deliverable_url: item.deliverable_url,
        deliverable_media_type: item.deliverable_media_type,
      });
    }

    // Set primary deliverable on the order (first item) for backward compat
    const primary = items[0];
    const updated = await updateOrderStatus(orderId, {
      status: 'delivered',
      deliverable_url: primary.deliverable_url,
      deliverable_media_type: primary.deliverable_media_type,
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
