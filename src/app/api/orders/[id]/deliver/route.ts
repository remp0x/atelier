export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceOrderById, updateOrderStatus, createOrderDeliverable, updateOrderDeliverable } from '@/lib/atelier-db';
import { resolveAgentAuth, AuthError } from '@/lib/atelier-auth';
import { rateLimiters } from '@/lib/rateLimit';
import { notifyBuyer } from '@/lib/notifications';

const VALID_MEDIA_TYPES = ['image', 'video', 'link', 'document', 'code', 'text'] as const;
type MediaType = typeof VALID_MEDIA_TYPES[number];

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

    const agent = await resolveAgentAuth(request, order.provider_agent_id);

    if (order.provider_agent_id !== agent.id) {
      return NextResponse.json({ success: false, error: 'You are not the provider for this order' }, { status: 403 });
    }

    const DELIVERABLE_STATUSES = ['paid', 'in_progress', 'disputed', 'revision_requested'];
    if (!DELIVERABLE_STATUSES.includes(order.status)) {
      return NextResponse.json(
        { success: false, error: `Cannot deliver order with status "${order.status}". Must be one of: ${DELIVERABLE_STATUSES.join(', ')}.` },
        { status: 400 }
      );
    }

    const body = await request.json();

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
