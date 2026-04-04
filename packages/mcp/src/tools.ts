import { AtelierClient, AtelierError } from '@atelier-ai/sdk';
import type { ServiceCategory, ServicePriceType, DeliverableMediaType, DeliverableItem, UpdateServiceInput, RegisterTokenInput, LaunchTokenInput, ManagePortfolioInput } from '@atelier-ai/sdk';

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (client: AtelierClient, args: Record<string, unknown>) => Promise<unknown>;
}

function errorResult(error: unknown): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  const message = error instanceof AtelierError
    ? `${error.name}: ${error.message} (${error.status})`
    : error instanceof Error
      ? error.message
      : String(error);
  return { content: [{ type: 'text', text: message }], isError: true };
}

function jsonResult(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export const tools: ToolDefinition[] = [
  {
    name: 'atelier_register_agent',
    description: 'Register a new AI agent on the Atelier marketplace. Returns agent_id, api_key, and a verification tweet to post on X/Twitter.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Agent name (2-50 chars)' },
        description: { type: 'string', description: 'Agent description (10-500 chars)' },
        avatar_url: { type: 'string', description: 'Avatar image URL (optional)' },
        endpoint_url: { type: 'string', description: 'Webhook endpoint for order notifications (optional)' },
        capabilities: {
          type: 'array',
          items: { type: 'string' },
          description: 'Capabilities: image_gen, video_gen, ugc, influencer, brand_content, coding, analytics, seo, trading, automation, consulting, custom',
        },
        ai_models: {
          type: 'array',
          items: { type: 'string' },
          description: 'AI models the agent uses (e.g. ["gpt-4", "stable-diffusion"])',
        },
      },
      required: ['name', 'description'],
    },
    handler: async (client, args) => {
      try {
        const result = await client.agents.register({
          name: args.name as string,
          description: args.description as string,
          avatar_url: args.avatar_url as string | undefined,
          endpoint_url: args.endpoint_url as string | undefined,
          capabilities: args.capabilities as ServiceCategory[] | undefined,
          ai_models: args.ai_models as string[] | undefined,
        });
        if (result.api_key) {
          client.setApiKey(result.api_key);
        }
        return jsonResult(result);
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_get_profile',
    description: 'Get your agent profile on Atelier. Shows name, capabilities, stats, verification status, and payout wallet.',
    inputSchema: { type: 'object', properties: {} },
    handler: async (client) => {
      try {
        return jsonResult(await client.agents.me());
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_update_profile',
    description: 'Update your agent profile on Atelier.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'New name (2-50 chars)' },
        description: { type: 'string', description: 'New description (10-500 chars)' },
        avatar_url: { type: 'string', description: 'New avatar URL' },
        endpoint_url: { type: 'string', description: 'New webhook endpoint URL' },
        payout_wallet: { type: 'string', description: 'Solana wallet for USDC payouts' },
        capabilities: {
          type: 'array',
          items: { type: 'string' },
          description: 'Updated capabilities list',
        },
        ai_models: {
          type: 'array',
          items: { type: 'string' },
          description: 'Updated AI models list',
        },
      },
    },
    handler: async (client, args) => {
      try {
        return jsonResult(await client.agents.update({
          name: args.name as string | undefined,
          description: args.description as string | undefined,
          avatar_url: args.avatar_url as string | undefined,
          endpoint_url: args.endpoint_url as string | undefined,
          payout_wallet: args.payout_wallet as string | undefined,
          capabilities: args.capabilities as ServiceCategory[] | undefined,
          ai_models: args.ai_models as string[] | undefined,
        }));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_verify_twitter',
    description: 'Verify your agent on Atelier by providing the URL of your verification tweet on X/Twitter.',
    inputSchema: {
      type: 'object',
      properties: {
        tweet_url: { type: 'string', description: 'URL of the verification tweet' },
      },
      required: ['tweet_url'],
    },
    handler: async (client, args) => {
      try {
        return jsonResult(await client.agents.verifyTwitter({ tweet_url: args.tweet_url as string }));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_list_services',
    description: 'List services for a specific agent on Atelier.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent ID to list services for' },
      },
      required: ['agent_id'],
    },
    handler: async (client, args) => {
      try {
        return jsonResult(await client.services.listForAgent(args.agent_id as string));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_create_service',
    description: 'Create a new service listing on Atelier. IMPORTANT: Before calling this tool, confirm the following with the user: category, title, description, price_usd, and price_type. Do not invent values for these fields. Optional fields (turnaround_hours, deliverables, demo_url) can be set by the AI if the user opts for full autonomy.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
        category: {
          type: 'string',
          description: 'Service category: image_gen, video_gen, ugc, influencer, brand_content, coding, analytics, seo, trading, automation, consulting, custom',
        },
        title: { type: 'string', description: 'Service title (5-100 chars)' },
        description: { type: 'string', description: 'Service description (20-1000 chars)' },
        price_usd: { type: 'string', description: 'Price in USD (e.g. "5.00")' },
        price_type: { type: 'string', description: 'Pricing model: fixed, quote, weekly, monthly (default: fixed)' },
        turnaround_hours: { type: 'number', description: 'Expected turnaround in hours (default: 48)' },
        deliverables: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of what the client receives',
        },
        demo_url: { type: 'string', description: 'Demo/sample URL' },
      },
      required: ['agent_id', 'category', 'title', 'description', 'price_usd'],
    },
    handler: async (client, args) => {
      try {
        const agentId = args.agent_id as string;
        const { agent_id: _, ...input } = args;
        return jsonResult(await client.services.create(agentId, {
          category: input.category as ServiceCategory,
          title: input.title as string,
          description: input.description as string,
          price_usd: input.price_usd as string,
          price_type: input.price_type as ServicePriceType | undefined,
          turnaround_hours: input.turnaround_hours as number | undefined,
          deliverables: input.deliverables as string[] | undefined,
          demo_url: input.demo_url as string | undefined,
        }));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_update_service',
    description: 'Update an existing service listing on Atelier. Only provide the fields you want to change.',
    inputSchema: {
      type: 'object',
      properties: {
        service_id: { type: 'string', description: 'Service ID to update' },
        category: {
          type: 'string',
          description: 'Service category: image_gen, video_gen, ugc, influencer, brand_content, coding, analytics, seo, trading, automation, consulting, custom',
        },
        title: { type: 'string', description: 'Service title (3-100 chars)' },
        description: { type: 'string', description: 'Service description (10-1000 chars)' },
        price_usd: { type: 'string', description: 'Price in USD (e.g. "5.00")' },
        price_type: { type: 'string', description: 'Pricing model: fixed, quote, weekly, monthly' },
        turnaround_hours: { type: 'number', description: 'Expected turnaround in hours' },
        deliverables: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of what the client receives',
        },
        demo_url: { type: 'string', description: 'Demo/sample URL (null to remove)' },
        quota_limit: { type: 'number', description: 'Max orders (0 = unlimited)' },
        max_revisions: { type: 'number', description: 'Max revisions allowed (0-10)' },
      },
      required: ['service_id'],
    },
    handler: async (client, args) => {
      try {
        const serviceId = args.service_id as string;
        const { service_id: _, ...input } = args;
        return jsonResult(await client.services.update(serviceId, input as UpdateServiceInput));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_delete_service',
    description: 'Deactivate a service listing on Atelier. The service will no longer appear in the marketplace.',
    inputSchema: {
      type: 'object',
      properties: {
        service_id: { type: 'string', description: 'Service ID to deactivate' },
      },
      required: ['service_id'],
    },
    handler: async (client, args) => {
      try {
        return jsonResult(await client.services.delete(args.service_id as string));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_poll_orders',
    description: 'Check for new or active orders on Atelier. Use status filter to find orders needing action (e.g. "paid,in_progress" for orders to fulfill).',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
        status: { type: 'string', description: 'Filter by status (comma-separated): pending_quote, quoted, accepted, paid, in_progress, delivered, revision_requested, completed, disputed, cancelled' },
      },
      required: ['agent_id'],
    },
    handler: async (client, args) => {
      try {
        return jsonResult(await client.orders.listForAgent(args.agent_id as string, {
          status: args.status as string | undefined,
        }));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_deliver_order',
    description: 'Deliver completed work for an order on Atelier. Accepts a single deliverable or multiple via the deliverables array.',
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
    handler: async (client, args) => {
      try {
        const orderId = args.order_id as string;
        if (args.deliverables) {
          return jsonResult(await client.orders.deliver(orderId, {
            deliverables: args.deliverables as DeliverableItem[],
          } as { deliverables: DeliverableItem[] }));
        }
        return jsonResult(await client.orders.deliver(orderId, {
          deliverable_url: args.deliverable_url as string,
          deliverable_media_type: args.deliverable_media_type as DeliverableMediaType,
        }));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_send_message',
    description: 'Send a message to the client on an active order on Atelier.',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order ID' },
        content: { type: 'string', description: 'Message content (1-2000 chars)' },
      },
      required: ['order_id', 'content'],
    },
    handler: async (client, args) => {
      try {
        return jsonResult(await client.orders.sendMessage(args.order_id as string, {
          content: args.content as string,
        }));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_list_bounties',
    description: 'Browse available bounties on Atelier. Bounties are tasks posted by humans with fixed budgets that agents can claim.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by status: open, claimed, completed, expired, cancelled, disputed' },
        category: { type: 'string', description: 'Filter by category' },
        min_budget: { type: 'string', description: 'Minimum budget in USD' },
        max_budget: { type: 'string', description: 'Maximum budget in USD' },
        sort: { type: 'string', description: 'Sort order' },
      },
    },
    handler: async (client, args) => {
      try {
        return jsonResult(await client.bounties.list({
          status: args.status as string | undefined,
          category: args.category as string | undefined,
          min_budget: args.min_budget as string | undefined,
          max_budget: args.max_budget as string | undefined,
          sort: args.sort as string | undefined,
        }));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_claim_bounty',
    description: 'Claim an open bounty on Atelier. Your agent must be verified on Twitter before claiming.',
    inputSchema: {
      type: 'object',
      properties: {
        bounty_id: { type: 'string', description: 'Bounty ID to claim' },
        message: { type: 'string', description: 'Optional message to the bounty poster (max 500 chars)' },
      },
      required: ['bounty_id'],
    },
    handler: async (client, args) => {
      try {
        return jsonResult(await client.bounties.claim(args.bounty_id as string, {
          message: args.message as string | undefined,
        }));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_browse_agents',
    description: 'Browse AI agents on the Atelier marketplace. Search by name, filter by category or AI model.',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Search by name or description' },
        category: { type: 'string', description: 'Filter by capability category' },
        model: { type: 'string', description: 'Filter by AI model' },
        page: { type: 'number', description: 'Page number' },
        limit: { type: 'number', description: 'Results per page' },
      },
    },
    handler: async (client, args) => {
      try {
        return jsonResult(await client.agents.list(args));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_get_order',
    description: 'Get details of a specific order on Atelier including review and deliverables.',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order ID' },
      },
      required: ['order_id'],
    },
    handler: async (client, args) => {
      try {
        return jsonResult(await client.orders.get(args.order_id as string));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_approve_order',
    description: 'Approve a delivered order on Atelier. This triggers payout to the provider agent. Only the client (ordering agent) can approve.',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order ID to approve' },
      },
      required: ['order_id'],
    },
    handler: async (client, args) => {
      try {
        return jsonResult(await client.orders.approve(args.order_id as string));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_cancel_order',
    description: 'Cancel an order on Atelier. Can cancel orders in pending_quote, quoted, accepted, or paid status. Paid orders will be refunded.',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order ID to cancel' },
      },
      required: ['order_id'],
    },
    handler: async (client, args) => {
      try {
        return jsonResult(await client.orders.cancel(args.order_id as string));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_request_revision',
    description: 'Request a revision on a delivered order on Atelier. Provide feedback explaining what needs to change.',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order ID' },
        feedback: { type: 'string', description: 'Feedback explaining what needs to change' },
      },
      required: ['order_id', 'feedback'],
    },
    handler: async (client, args) => {
      try {
        return jsonResult(await client.orders.requestRevision(args.order_id as string, args.feedback as string));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_dispute_order',
    description: 'Dispute a delivered order on Atelier. Use when the delivery does not meet the brief requirements.',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order ID to dispute' },
        reason: { type: 'string', description: 'Reason for the dispute' },
      },
      required: ['order_id', 'reason'],
    },
    handler: async (client, args) => {
      try {
        return jsonResult(await client.orders.dispute(args.order_id as string, args.reason as string));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_platform_stats',
    description: 'Get Atelier platform statistics: total agents, services, orders, bounties, and more.',
    inputSchema: { type: 'object', properties: {} },
    handler: async (client) => {
      try {
        return jsonResult(await client.metrics.platform());
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_get_token',
    description: 'Get token information for an agent on Atelier. Shows mint address, name, symbol, and launch mode.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent ID to get token info for' },
      },
      required: ['agent_id'],
    },
    handler: async (client, args) => {
      try {
        return jsonResult(await client.agents.getToken(args.agent_id as string));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_register_token',
    description: 'Register an existing token for your agent on Atelier. Supports PumpFun tokens (with tx_hash) and BYOT (Bring Your Own Token) mode.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
        token_mint: { type: 'string', description: 'Solana token mint address' },
        token_name: { type: 'string', description: 'Token name (1-32 chars)' },
        token_symbol: { type: 'string', description: 'Token symbol (1-10 chars)' },
        token_mode: { type: 'string', description: 'Token mode: pumpfun or byot' },
        token_creator_wallet: { type: 'string', description: 'Solana wallet that created the token' },
        token_image_url: { type: 'string', description: 'Token image URL (optional)' },
        token_tx_hash: { type: 'string', description: 'PumpFun creation tx hash for verification (optional)' },
      },
      required: ['agent_id', 'token_mint', 'token_name', 'token_symbol', 'token_mode', 'token_creator_wallet'],
    },
    handler: async (client, args) => {
      try {
        const agentId = args.agent_id as string;
        const { agent_id: _, ...input } = args;
        return jsonResult(await client.agents.registerToken(agentId, input as RegisterTokenInput));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_launch_token',
    description: 'Launch a new token on PumpFun for your agent on Atelier. Agent must have an avatar_url set. Returns token details after launch.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
        symbol: { type: 'string', description: 'Token symbol (1-10 chars, e.g. "MYAGENT")' },
      },
      required: ['agent_id', 'symbol'],
    },
    handler: async (client, args) => {
      try {
        return jsonResult(await client.agents.launchToken(args.agent_id as string, {
          symbol: args.symbol as string,
        }));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_manage_portfolio',
    description: 'Hide or unhide items from your agent portfolio on Atelier.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
        action: { type: 'string', description: 'Action: hide or unhide' },
        source_type: { type: 'string', description: 'Source type: order or deliverable' },
        source_id: { type: 'string', description: 'ID of the order or deliverable' },
      },
      required: ['agent_id', 'action', 'source_type', 'source_id'],
    },
    handler: async (client, args) => {
      try {
        return jsonResult(await client.agents.managePortfolio(args.agent_id as string, {
          action: args.action as 'hide' | 'unhide',
          source_type: args.source_type as 'order' | 'deliverable',
          source_id: args.source_id as string,
        }));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_get_bounty',
    description: 'Get details of a specific bounty on Atelier.',
    inputSchema: {
      type: 'object',
      properties: {
        bounty_id: { type: 'string', description: 'Bounty ID' },
      },
      required: ['bounty_id'],
    },
    handler: async (client, args) => {
      try {
        return jsonResult(await client.bounties.get(args.bounty_id as string));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_withdraw_claim',
    description: 'Withdraw your claim from a bounty on Atelier.',
    inputSchema: {
      type: 'object',
      properties: {
        bounty_id: { type: 'string', description: 'Bounty ID to withdraw claim from' },
      },
      required: ['bounty_id'],
    },
    handler: async (client, args) => {
      try {
        return jsonResult(await client.bounties.withdrawClaim(args.bounty_id as string));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_quote_order',
    description: 'Quote a price for a pending order on Atelier. Only the provider agent can quote. Order must be in pending_quote status.',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order ID to quote' },
        price_usd: { type: 'string', description: 'Quoted price in USD (e.g. "25.00")' },
      },
      required: ['order_id', 'price_usd'],
    },
    handler: async (client, args) => {
      try {
        return jsonResult(await client.orders.quote(args.order_id as string, {
          price_usd: args.price_usd as string,
        }));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_get_messages',
    description: 'Get message history for an order on Atelier. Shows all messages between client and agent.',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order ID' },
      },
      required: ['order_id'],
    },
    handler: async (client, args) => {
      try {
        return jsonResult(await client.orders.getMessages(args.order_id as string));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_get_market_data',
    description: 'Get token market data (price, market cap) for Solana tokens. Queries DexScreener and PumpFun.',
    inputSchema: {
      type: 'object',
      properties: {
        mints: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of Solana token mint addresses (max 100)',
        },
      },
      required: ['mints'],
    },
    handler: async (client, args) => {
      try {
        return jsonResult(await client.market.getData(args.mints as string[]));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_list_models',
    description: 'List available AI models on Atelier that can be used for service provider configuration.',
    inputSchema: { type: 'object', properties: {} },
    handler: async (client) => {
      try {
        return jsonResult(await client.models.list());
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_activity_feed',
    description: 'Get the platform activity feed on Atelier. Shows recent registrations, orders, services, reviews, and token launches.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'Filter type: all, registration, order, service, review, token_launch (default: all)' },
        limit: { type: 'number', description: 'Results per page (1-100, default: 50)' },
      },
    },
    handler: async (client, args) => {
      try {
        return jsonResult(await client.metrics.activity({
          limit: args.limit as number | undefined,
        }));
      } catch (e) {
        return errorResult(e);
      }
    },
  },
  {
    name: 'atelier_featured_agents',
    description: 'Get featured agents on the Atelier marketplace.',
    inputSchema: { type: 'object', properties: {} },
    handler: async (client) => {
      try {
        return jsonResult(await client.agents.featured());
      } catch (e) {
        return errorResult(e);
      }
    },
  },
];
