import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getServiceOrderById, getReviewByOrderId, getServiceById, updateOrderStatus, getOrderDeliverables, getAtelierAgent, getPayoutWallet, isEscrowTxHashUsed, atomicStatusTransition } from '@/lib/atelier-db';
import { getProvider } from '@/lib/providers/registry';
import { generateWithRetry } from '@/lib/providers/types';
import { requireWalletAuth, WalletAuthError } from '@/lib/solana-auth';
import { verifySolanaUsdcPayment } from '@/lib/solana-verify';
import { sendUsdcPayout } from '@/lib/solana-payout';
import { notifyAgentWebhook } from '@/lib/webhook';

export const maxDuration = 300;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    let order = await getServiceOrderById(id);
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    if (
      order.quota_total > 0 &&
      order.status === 'in_progress' &&
      order.workspace_expires_at &&
      new Date(order.workspace_expires_at) <= new Date()
    ) {
      order = (await updateOrderStatus(id, { status: 'delivered' }))!;
    }

    if (
      order.quota_total === 0 &&
      order.status === 'in_progress' &&
      !order.deliverable_url &&
      Date.now() - new Date(order.created_at).getTime() > 10 * 60 * 1000
    ) {
      order = (await updateOrderStatus(id, { status: 'paid' }))!;
    }

    const review = order.status === 'completed' ? await getReviewByOrderId(id) : null;
    const deliverables = order.quota_total > 0 ? await getOrderDeliverables(id) : [];

    const url = new URL(request.url);
    const wallet = url.searchParams.get('wallet');
    const isOwner = wallet && (wallet === order.client_wallet || wallet === order.provider_agent_id);

    const safeOrder = isOwner ? order : {
      ...order,
      escrow_tx_hash: undefined,
      payout_tx_hash: undefined,
    };

    return NextResponse.json({ success: true, data: { order: safeOrder, review, deliverables } });
  } catch (error) {
    console.error('Error fetching order:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch order' }, { status: 500 });
  }
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  pay: ['quoted', 'accepted', 'paid', 'in_progress'],
  approve: ['delivered'],
  cancel: ['pending_quote', 'quoted', 'accepted', 'paid'],
  dispute: ['delivered'],
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    if (!body.wallet || !action) {
      return NextResponse.json(
        { success: false, error: 'wallet, action, wallet_sig, and wallet_sig_ts are required' },
        { status: 400 },
      );
    }

    const order = await getServiceOrderById(id);
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    let wallet: string;
    try {
      wallet = requireWalletAuth(body, order.client_wallet);
    } catch (err) {
      const msg = err instanceof WalletAuthError ? err.message : 'Authentication failed';
      return NextResponse.json({ success: false, error: msg }, { status: 401 });
    }

    const allowedStatuses = VALID_TRANSITIONS[action as string];
    if (!allowedStatuses) {
      return NextResponse.json(
        { success: false, error: `Unknown action: ${action}` },
        { status: 400 },
      );
    }

    if (!allowedStatuses.includes(order.status)) {
      return NextResponse.json(
        { success: false, error: `Cannot ${action} order in status ${order.status}` },
        { status: 400 },
      );
    }

    if (action === 'cancel') {
      const claimed = await atomicStatusTransition(id, order.status, 'cancelled');
      if (!claimed) {
        return NextResponse.json(
          { success: false, error: 'Order status changed concurrently, please retry' },
          { status: 409 },
        );
      }

      let refundFailed = false;
      if (order.status === 'paid' && order.escrow_tx_hash && order.client_wallet && !order.payout_tx_hash) {
        const refundAmount = parseFloat(order.quoted_price_usd || '0') + parseFloat(order.platform_fee_usd || '0');
        if (refundAmount > 0) {
          try {
            const txHash = await sendUsdcPayout(order.client_wallet, refundAmount);
            await updateOrderStatus(id, { status: 'cancelled', payout_tx_hash: txHash });
          } catch (refundErr) {
            refundFailed = true;
            console.error(`Refund failed for order ${id}:`, refundErr);
          }
        }
      }

      const updated = await getServiceOrderById(id);
      notifyAgentWebhook(order.provider_agent_id, {
        event: 'order.cancelled',
        order_id: id,
        data: { previous_status: order.status },
      });
      return NextResponse.json({
        success: true,
        data: updated,
        ...(refundFailed && { warning: 'Order cancelled but refund failed. Contact support.' }),
      });
    }

    if (action === 'dispute') {
      const updated = await updateOrderStatus(id, { status: 'disputed' });
      notifyAgentWebhook(order.provider_agent_id, {
        event: 'order.disputed',
        order_id: id,
        data: {},
      });
      return NextResponse.json({ success: true, data: updated });
    }

    if (action === 'approve') {
      const claimed = await atomicStatusTransition(id, order.status, 'completed');
      if (!claimed) {
        return NextResponse.json(
          { success: false, error: 'Order status changed concurrently, please retry' },
          { status: 409 },
        );
      }

      const quotedPrice = parseFloat(order.quoted_price_usd || '0');
      let payoutFailed = false;
      if (quotedPrice > 0) {
        try {
          const agent = await getAtelierAgent(order.provider_agent_id);
          const destination = agent ? getPayoutWallet(agent) : null;
          if (destination) {
            const txHash = await sendUsdcPayout(destination, quotedPrice);
            await updateOrderStatus(id, { status: 'completed', payout_tx_hash: txHash });
          } else {
            payoutFailed = true;
            console.error(`Payout skipped for order ${id}: no destination wallet`);
          }
        } catch (payoutErr) {
          payoutFailed = true;
          console.error(`Payout failed for order ${id}:`, payoutErr);
        }
      }

      const finalOrder = await getServiceOrderById(id);
      notifyAgentWebhook(order.provider_agent_id, {
        event: 'order.completed',
        order_id: id,
        data: { payout_failed: payoutFailed },
      });
      return NextResponse.json({
        success: true,
        data: finalOrder,
        ...(payoutFailed && { warning: 'Order completed but payout failed. Contact support.' }),
      });
    }

    if (action === 'pay') {
      const { payment_method, escrow_tx_hash } = body;
      if (!escrow_tx_hash) {
        return NextResponse.json(
          { success: false, error: 'escrow_tx_hash required for pay action' },
          { status: 400 },
        );
      }

      const txAlreadyUsed = await isEscrowTxHashUsed(escrow_tx_hash);
      if (txAlreadyUsed) {
        return NextResponse.json(
          { success: false, error: 'This transaction has already been used for another order' },
          { status: 409 },
        );
      }

      const expectedAmount = parseFloat(order.quoted_price_usd || '0') + parseFloat(order.platform_fee_usd || '0');
      const verification = await verifySolanaUsdcPayment(escrow_tx_hash, wallet, expectedAmount);
      if (!verification.verified) {
        return NextResponse.json(
          { success: false, error: verification.error || 'Payment verification failed' },
          { status: 400 },
        );
      }

      await updateOrderStatus(id, {
        status: 'paid',
        payment_method: payment_method || 'usdc-sol',
        escrow_tx_hash,
      });

      const service = await getServiceById(order.service_id);

      if (service && service.quota_limit > 0) {
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await updateOrderStatus(id, {
          status: 'in_progress',
          workspace_expires_at: expiresAt,
        });
      } else if (service?.provider_key && service.provider_model) {
        try {
          await executeOrder(id, order, service);
        } catch (err) {
          console.error(`Auto-execute failed for order ${id}:`, err);
          await updateOrderStatus(id, { status: 'paid' });
        }
      }

      const updated = await getServiceOrderById(id);
      notifyAgentWebhook(order.provider_agent_id, {
        event: 'order.paid',
        order_id: id,
        data: { status: updated?.status },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    return NextResponse.json({ success: false, error: 'Unhandled action' }, { status: 400 });
  } catch (error) {
    console.error('Error patching order:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update order' },
      { status: 500 },
    );
  }
}

async function executeOrder(
  orderId: string,
  order: { brief: string; service_id: string; provider_agent_id: string },
  service: { provider_key: string | null; provider_model: string | null; system_prompt?: string | null },
): Promise<void> {
  await updateOrderStatus(orderId, { status: 'in_progress' });

  const fullPrompt = service.system_prompt
    ? `${service.system_prompt}\n\nUser request: ${order.brief}`
    : order.brief;

  const provider = getProvider(service.provider_key!);
  const result = await generateWithRetry(provider, {
    prompt: fullPrompt,
    model: service.provider_model!,
  });

  const mediaRes = await fetch(result.url);
  if (!mediaRes.ok) {
    throw new Error(`Failed to download generated media: ${mediaRes.status}`);
  }

  const agentId = order.provider_agent_id;

  const buffer = Buffer.from(await mediaRes.arrayBuffer());
  const ext = result.media_type === 'video' ? 'mp4' : 'png';
  const contentType = result.media_type === 'video' ? 'video/mp4' : 'image/png';
  const blobPath = `atelier/${agentId}/${Date.now()}.${ext}`;

  const blob = await put(blobPath, buffer, { access: 'public', contentType });

  await updateOrderStatus(orderId, {
    status: 'delivered',
    deliverable_url: blob.url,
    deliverable_media_type: result.media_type,
  });
}
