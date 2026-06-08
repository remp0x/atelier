export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getServiceOrderById,
  createOrderMessage,
  getOrderMessages,
  getLastOrderMessage,
  markOrderMessagesRead,
  getAtelierAgent,
  getAtelierProfile,
} from '@/lib/atelier-db';
import { AuthError } from '@/lib/atelier-auth';
import { authorizeOrderProvider } from '@/lib/order-auth';
import { WalletAuthError } from '@/lib/solana-auth';
import { authenticateUserRequest, readSigFieldsFromQuery } from '@/lib/session';
import { rateLimiters } from '@/lib/rateLimit';
import { notifyAgentWebhook } from '@/lib/webhook';
import { notifyBuyer } from '@/lib/notifications';

interface AuthResult {
  type: 'agent' | 'client';
  id: string;
}

async function resolveAuth(
  request: NextRequest,
  order: { provider_agent_id: string },
  body?: Record<string, unknown>,
): Promise<AuthResult> {
  try {
    const agent = await authorizeOrderProvider(request, body ?? null, order);
    return { type: 'agent', id: agent.id };
  } catch (e) {
    if (!(e instanceof AuthError)) throw e;
    // Not the provider; try buyer (wallet/session) auth below.
  }

  const sigFallback = body ?? readSigFieldsFromQuery(request);
  try {
    const wallet = await authenticateUserRequest(request, sigFallback);
    return { type: 'client', id: wallet };
  } catch (e) {
    if (e instanceof WalletAuthError) throw new AuthError(e.message);
    throw e;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;

    const order = await getServiceOrderById(orderId);
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    const auth = await resolveAuth(request, order);

    const isClient = auth.type === 'client' && auth.id === order.client_wallet;
    const isAgent = auth.type === 'agent' && auth.id === order.provider_agent_id;
    if (!isClient && !isAgent) {
      return NextResponse.json({ success: false, error: 'Not authorized for this order' }, { status: 403 });
    }

    const messages = await getOrderMessages(orderId);
    await markOrderMessagesRead(orderId, auth.id);

    return NextResponse.json({ success: true, data: messages });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error('GET /api/orders/[id]/messages error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimitResponse = rateLimiters.messages(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { id: orderId } = await params;
    const body = await request.json();

    const order = await getServiceOrderById(orderId);
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    const auth = await resolveAuth(request, order, body);

    const isClient = auth.type === 'client' && auth.id === order.client_wallet;
    const isAgent = auth.type === 'agent' && auth.id === order.provider_agent_id;
    if (!isClient && !isAgent) {
      return NextResponse.json({ success: false, error: 'Not authorized for this order' }, { status: 403 });
    }

    const allowedStatuses = ['paid', 'in_progress', 'delivered', 'revision_requested', 'completed', 'disputed'];
    if (!allowedStatuses.includes(order.status)) {
      return NextResponse.json({ success: false, error: 'Messaging not available for this order status' }, { status: 400 });
    }

    const content = (body.content as string)?.trim();
    if (!content || content.length < 1 || content.length > 2000) {
      return NextResponse.json({ success: false, error: 'Content must be 1-2000 characters' }, { status: 400 });
    }

    // Idempotency guard: collapse consecutive identical messages from the same
    // sender. Stops misbehaving agents that re-post the same prompt every poll
    // cycle (and accidental double-sends) from spamming the thread, while still
    // allowing a re-send once the other party has replied.
    const lastMessage = await getLastOrderMessage(orderId);
    if (lastMessage && lastMessage.sender_id === auth.id && lastMessage.content === content) {
      return NextResponse.json({ success: true, data: lastMessage, deduped: true });
    }

    let senderName: string | undefined;
    if (auth.type === 'agent') {
      const agent = await getAtelierAgent(auth.id);
      senderName = agent?.name ?? undefined;
    } else {
      const profile = await getAtelierProfile(auth.id);
      senderName = profile?.display_name ?? `${auth.id.slice(0, 4)}...${auth.id.slice(-4)}`;
    }

    const message = await createOrderMessage({
      order_id: orderId,
      sender_type: isAgent ? 'agent' : 'client',
      sender_id: auth.id,
      sender_name: senderName,
      content,
    });

    if (isClient) {
      notifyAgentWebhook(order.provider_agent_id, {
        event: 'order.message',
        order_id: orderId,
        data: { sender_type: 'client', sender_name: senderName, content },
      });
    }

    if (isAgent && order.client_wallet) {
      notifyBuyer('order_message', {
        wallet: order.client_wallet,
        orderId,
        agentName: senderName || 'Agent',
        serviceTitle: order.service_title || 'Service',
      });
    }

    return NextResponse.json({ success: true, data: message });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error('POST /api/orders/[id]/messages error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
