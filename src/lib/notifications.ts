import { createNotification, getAtelierAgent, type ModerationStatus, type NotificationType } from '@/lib/atelier-db';

interface NotificationContext {
  wallet: string;
  orderId: string;
  agentName: string;
  serviceTitle: string;
}

type TemplateRenderer = (ctx: NotificationContext & Record<string, string>) => { title: string; body: string };

const BUYER_TEMPLATES: Record<string, TemplateRenderer> = {
  order_quoted: (ctx) => ({
    title: 'Order quoted',
    body: `${ctx.agentName} quoted $${ctx.price} for "${ctx.serviceTitle}"`,
  }),
  order_delivered: (ctx) => ({
    title: 'Order delivered',
    body: `${ctx.agentName} delivered your order for "${ctx.serviceTitle}"`,
  }),
  order_revision: (ctx) => ({
    title: 'Revision requested',
    body: `You requested a revision for "${ctx.serviceTitle}" from ${ctx.agentName}`,
  }),
  order_message: (ctx) => ({
    title: 'New message',
    body: `${ctx.agentName} sent a message on "${ctx.serviceTitle}"`,
  }),
};

const PROVIDER_TEMPLATES: Record<string, TemplateRenderer> = {
  provider_order_received: (ctx) => ({
    title: 'New order received',
    body: `Your agent "${ctx.agentName}" received a new order for "${ctx.serviceTitle}"`,
  }),
  provider_order_paid: (ctx) => ({
    title: 'Order paid — ready to deliver',
    body: `A client paid for "${ctx.serviceTitle}" on your agent "${ctx.agentName}". Delivery is pending.`,
  }),
  provider_webhook_failed: (ctx) => ({
    title: 'Webhook delivery failed',
    body: `Failed to notify your agent "${ctx.agentName}" about order for "${ctx.serviceTitle}". Check your endpoint URL.`,
  }),
  provider_payout_retry_requested: (ctx) => ({
    title: 'Payout retry requested',
    body: `Agent "${ctx.agentName}" requested a payout retry for order ${ctx.orderId}.`,
  }),
};

export async function notifyBuyer(
  type: NotificationType,
  ctx: NotificationContext,
  extra?: Record<string, string>,
): Promise<void> {
  try {
    const template = BUYER_TEMPLATES[type];
    if (!template) return;
    const { title, body } = template({ ...ctx, ...extra } as NotificationContext & Record<string, string>);
    await createNotification({
      wallet: ctx.wallet,
      type,
      title,
      body,
      order_id: ctx.orderId,
    });
  } catch {
    // fire-and-forget
  }
}

const ADMIN_WALLET = 'EZkoXXZ5HEWdKwfv7wua7k6Dqv8aQxxHWNakq2gG2Qpb';

export async function notifyAdmin(
  type: NotificationType,
  ctx: Omit<NotificationContext, 'wallet'>,
): Promise<void> {
  try {
    const allTemplates = { ...BUYER_TEMPLATES, ...PROVIDER_TEMPLATES };
    const template = allTemplates[type];
    if (!template) return;
    const fullCtx: NotificationContext & Record<string, string> = {
      wallet: ADMIN_WALLET,
      orderId: ctx.orderId,
      agentName: ctx.agentName,
      serviceTitle: ctx.serviceTitle,
    };
    const { title, body } = template(fullCtx);
    await createNotification({
      wallet: ADMIN_WALLET,
      type,
      title,
      body,
      order_id: ctx.orderId,
    });
  } catch {
    // fire-and-forget
  }
}

export async function notifyAgentModeration(
  agentId: string,
  status: Exclude<ModerationStatus, 'ok'>,
  reason: string,
): Promise<void> {
  try {
    const agent = await getAtelierAgent(agentId);
    if (!agent) return;

    // Privy-registered agents may have no owner_wallet; those owners fetch
    // notifications by user_id, so an empty wallet still reaches them.
    const userId = agent.user_id ?? agent.privy_user_id ?? null;
    const wallet = agent.owner_wallet ?? '';
    if (!wallet && !userId) return;

    const { title, body } = status === 'spam'
      ? {
          title: 'Agent flagged as spam',
          body: `Your agent "${agent.name}" was flagged as spam and hidden from the marketplace: ${reason}. Contact support on Telegram (t.me/atelierai) if you believe this is a mistake.`,
        }
      : {
          title: 'Agent needs changes',
          body: `Your agent "${agent.name}" was hidden from the marketplace: ${reason}. Edit its name or description and save — it is re-reviewed automatically and relisted once it passes.`,
        };

    await createNotification({
      wallet,
      user_id: userId,
      type: status === 'spam' ? 'agent_moderation_spam' : 'agent_moderation_review',
      title,
      body,
    });
  } catch {
    // fire-and-forget
  }
}

export async function notifyProvider(
  type: NotificationType,
  agentId: string,
  ctx: Omit<NotificationContext, 'wallet'> & { wallet?: string },
): Promise<void> {
  try {
    const agent = await getAtelierAgent(agentId);
    const ownerWallet = agent?.owner_wallet;
    if (!ownerWallet) return;

    const template = PROVIDER_TEMPLATES[type];
    if (!template) return;

    const fullCtx: NotificationContext & Record<string, string> = {
      wallet: ownerWallet,
      orderId: ctx.orderId,
      agentName: ctx.agentName,
      serviceTitle: ctx.serviceTitle,
    };
    const { title, body } = template(fullCtx);
    await createNotification({
      wallet: ownerWallet,
      type,
      title,
      body,
      order_id: ctx.orderId,
    });
  } catch {
    // fire-and-forget
  }
}
