import { NextRequest, NextResponse } from 'next/server';
import {
  getServiceOrderById,
  createOrderMessage,
  getOrderMessages,
  markOrderMessagesRead,
  getAtelierAgent,
  getAtelierProfile,
} from '@/lib/atelier-db';
import { resolveExternalAgentByApiKey, AuthError } from '@/lib/atelier-auth';
import { requireWalletAuth, WalletAuthError } from '@/lib/solana-auth';
import { rateLimiters } from '@/lib/rateLimit';
import { notifyAgentWebhook } from '@/lib/webhook';

interface AuthResult {
  type: 'agent' | 'client';
  id: string;
}

async function resolveAuth(request: NextRequest, body?: Record<string, unknown>, readOnly = false): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const agent = await resolveExternalAgentByApiKey(request);
    return { type: 'agent', id: agent.id };
  }

  const url = new URL(request.url);
  const wallet = (body?.wallet as string) || url.searchParams.get('wallet');
  const walletSig = (body?.wallet_sig as string) || url.searchParams.get('wallet_sig');
  const walletSigTs = Number((body?.wallet_sig_ts as string | number) || url.searchParams.get('wallet_sig_ts'));

  if (!wallet || !walletSig || !walletSigTs) {
    throw new AuthError('Authentication required: Bearer api_key or wallet signature');
  }

  try {
    requireWalletAuth(
      { wallet, wallet_sig: walletSig, wallet_sig_ts: walletSigTs },
      null,
      { replayProtection: !readOnly },
    );
  } catch (e) {
    if (e instanceof WalletAuthError) throw new AuthError(e.message);
    throw e;
  }

  return { type: 'client', id: wallet };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const auth = await resolveAuth(request, undefined, true);

    const order = await getServiceOrderById(orderId);
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

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
    const auth = await resolveAuth(request, body);

    const order = await getServiceOrderById(orderId);
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    const isClient = auth.type === 'client' && auth.id === order.client_wallet;
    const isAgent = auth.type === 'agent' && auth.id === order.provider_agent_id;
    if (!isClient && !isAgent) {
      return NextResponse.json({ success: false, error: 'Not authorized for this order' }, { status: 403 });
    }

    const allowedStatuses = ['paid', 'in_progress', 'delivered', 'completed'];
    if (!allowedStatuses.includes(order.status)) {
      return NextResponse.json({ success: false, error: 'Messaging not available for this order status' }, { status: 400 });
    }

    const content = (body.content as string)?.trim();
    if (!content || content.length < 1 || content.length > 2000) {
      return NextResponse.json({ success: false, error: 'Content must be 1-2000 characters' }, { status: 400 });
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

    return NextResponse.json({ success: true, data: message });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error('POST /api/orders/[id]/messages error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
