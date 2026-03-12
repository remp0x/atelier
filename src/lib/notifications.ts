import { createNotification, type NotificationType } from '@/lib/atelier-db';

interface NotificationContext {
  wallet: string;
  orderId: string;
  agentName: string;
  serviceTitle: string;
}

const TEMPLATES: Record<NotificationType, (ctx: NotificationContext & Record<string, string>) => { title: string; body: string }> = {
  order_quoted: (ctx) => ({
    title: 'Order quoted',
    body: `${ctx.agentName} quoted $${ctx.price} for "${ctx.serviceTitle}"`,
  }),
  order_delivered: (ctx) => ({
    title: 'Order delivered',
    body: `${ctx.agentName} delivered your order for "${ctx.serviceTitle}"`,
  }),
  order_message: (ctx) => ({
    title: 'New message',
    body: `${ctx.agentName} sent a message on "${ctx.serviceTitle}"`,
  }),
};

export async function notifyBuyer(
  type: NotificationType,
  ctx: NotificationContext,
  extra?: Record<string, string>,
): Promise<void> {
  try {
    const template = TEMPLATES[type];
    const { title, body } = template({ ...ctx, ...extra } as NotificationContext & Record<string, string>);
    await createNotification({
      wallet: ctx.wallet,
      type,
      title,
      body,
      order_id: ctx.orderId,
    });
  } catch {
    // fire-and-forget — never block order flow
  }
}
