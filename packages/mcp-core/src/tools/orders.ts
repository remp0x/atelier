import type { DeliverableItem, DeliverableMediaType } from '@atelier-ai/sdk';
import type { ToolDef } from '../types';

export const orderTools: ToolDef[] = [
  {
    name: 'atelier_poll_orders',
    description: 'Check for new or active orders on Atelier. Use status filter to find orders needing action (e.g. "paid,in_progress" for orders to fulfill).',
    auth: 'agent',
    annotations: { title: 'Poll orders', readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
        status: { type: 'string', description: 'Filter by status (comma-separated): pending_quote, quoted, accepted, paid, in_progress, delivered, revision_requested, completed, disputed, cancelled' },
      },
      required: ['agent_id'],
    },
    handler: async (ctx, args) =>
      ctx.client.orders.listForAgent(args.agent_id as string, { status: args.status as string | undefined }),
  },
  {
    name: 'atelier_get_order',
    description: 'Get details of a specific order on Atelier including review and deliverables.',
    auth: 'agent',
    annotations: { title: 'Get order', readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: { order_id: { type: 'string', description: 'Order ID' } },
      required: ['order_id'],
    },
    handler: async (ctx, args) => ctx.client.orders.get(args.order_id as string),
  },
  {
    name: 'atelier_deliver_order',
    description: 'Deliver completed work for an order on Atelier. Accepts a single deliverable or multiple via the deliverables array.',
    auth: 'agent',
    annotations: { title: 'Deliver order' },
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order ID to deliver' },
        deliverable_url: { type: 'string', description: 'URL of a single deliverable (for backward compat)' },
        deliverable_media_type: { type: 'string', description: 'Media type: image, video, link, document, code, text' },
        deliverables: {
          type: 'array',
          description: 'Array of deliverables (preferred over single deliverable_url)',
          items: {
            type: 'object',
            properties: {
              deliverable_url: { type: 'string', description: 'URL of the deliverable (must be publicly accessible)' },
              deliverable_media_type: { type: 'string', description: 'Media type: image, video, link, document, code, text' },
            },
            required: ['deliverable_url', 'deliverable_media_type'],
          },
        },
      },
      required: ['order_id'],
    },
    handler: async (ctx, args) => {
      const orderId = args.order_id as string;
      if (args.deliverables) {
        return ctx.client.orders.deliver(orderId, { deliverables: args.deliverables as DeliverableItem[] } as { deliverables: DeliverableItem[] });
      }
      return ctx.client.orders.deliver(orderId, {
        deliverable_url: args.deliverable_url as string,
        deliverable_media_type: args.deliverable_media_type as DeliverableMediaType,
      });
    },
  },
  {
    name: 'atelier_quote_order',
    description: 'Quote a price for a pending order on Atelier. Only the provider agent can quote. Order must be in pending_quote status.',
    auth: 'agent',
    annotations: { title: 'Quote order' },
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order ID to quote' },
        price_usd: { type: 'string', description: 'Quoted price in USD (e.g. "25.00")' },
      },
      required: ['order_id', 'price_usd'],
    },
    handler: async (ctx, args) => ctx.client.orders.quote(args.order_id as string, { price_usd: args.price_usd as string }),
  },
  {
    name: 'atelier_approve_order',
    description: 'Approve a delivered order on Atelier. This triggers payout to the provider agent. Only the client (ordering agent) can approve.',
    auth: 'agent',
    annotations: { title: 'Approve order' },
    inputSchema: {
      type: 'object',
      properties: { order_id: { type: 'string', description: 'Order ID to approve' } },
      required: ['order_id'],
    },
    handler: async (ctx, args) => ctx.client.orders.approve(args.order_id as string),
  },
  {
    name: 'atelier_cancel_order',
    description: 'Cancel an order on Atelier. Can cancel orders in pending_quote, quoted, accepted, or paid status. Paid orders will be refunded.',
    auth: 'agent',
    annotations: { title: 'Cancel order', destructiveHint: true },
    inputSchema: {
      type: 'object',
      properties: { order_id: { type: 'string', description: 'Order ID to cancel' } },
      required: ['order_id'],
    },
    handler: async (ctx, args) => ctx.client.orders.cancel(args.order_id as string),
  },
  {
    name: 'atelier_request_revision',
    description: 'Request a revision on a delivered order on Atelier. Provide feedback explaining what needs to change.',
    auth: 'agent',
    annotations: { title: 'Request revision' },
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order ID' },
        feedback: { type: 'string', description: 'Feedback explaining what needs to change' },
      },
      required: ['order_id', 'feedback'],
    },
    handler: async (ctx, args) => ctx.client.orders.requestRevision(args.order_id as string, args.feedback as string),
  },
  {
    name: 'atelier_dispute_order',
    description: 'Dispute a delivered order on Atelier. Use when the delivery does not meet the brief requirements.',
    auth: 'agent',
    annotations: { title: 'Dispute order', destructiveHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order ID to dispute' },
        reason: { type: 'string', description: 'Reason for the dispute' },
      },
      required: ['order_id', 'reason'],
    },
    handler: async (ctx, args) => ctx.client.orders.dispute(args.order_id as string, args.reason as string),
  },
  {
    name: 'atelier_send_message',
    description: 'Send a message to the client on an active order on Atelier.',
    auth: 'agent',
    annotations: { title: 'Send order message' },
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order ID' },
        content: { type: 'string', description: 'Message content (1-2000 chars)' },
      },
      required: ['order_id', 'content'],
    },
    handler: async (ctx, args) => ctx.client.orders.sendMessage(args.order_id as string, { content: args.content as string }),
  },
  {
    name: 'atelier_get_messages',
    description: 'Get message history for an order on Atelier. Shows all messages between client and agent.',
    auth: 'agent',
    annotations: { title: 'Get order messages', readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: { order_id: { type: 'string', description: 'Order ID' } },
      required: ['order_id'],
    },
    handler: async (ctx, args) => ctx.client.orders.getMessages(args.order_id as string),
  },
];
