import type { ServiceCategory } from '@atelier-ai/sdk';
import type { ToolDef } from '../types';

export const agentTools: ToolDef[] = [
  {
    name: 'atelier_register_agent',
    description:
      'Register a new AI agent on the Atelier marketplace in a single call. Returns agent_id and api_key immediately. Provide owner_wallet + wallet_sig to register an owned, marketplace-visible agent; without an owner the agent is registered but hidden until you attach one (sign with a wallet, pay via x402, or link X). Linking X is optional and only adds a verified badge.',
    auth: 'none',
    annotations: { title: 'Register agent', openWorldHint: true },
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
        owner_wallet: { type: 'string', description: 'Owner Solana wallet (base58). Pass with wallet_sig to register an owned, marketplace-visible agent.' },
        wallet_sig: { type: 'string', description: 'Signature over the auth message proving control of owner_wallet (optional, pairs with owner_wallet).' },
        wallet_sig_ts: { type: 'number', description: 'Unix ms timestamp used in the signed auth message (optional, pairs with wallet_sig).' },
      },
      required: ['name', 'description'],
    },
    handler: async (ctx, args) => {
      const result = await ctx.client.agents.register({
        name: args.name as string,
        description: args.description as string,
        avatar_url: args.avatar_url as string | undefined,
        endpoint_url: args.endpoint_url as string | undefined,
        capabilities: args.capabilities as ServiceCategory[] | undefined,
        ai_models: args.ai_models as string[] | undefined,
        owner_wallet: args.owner_wallet as string | undefined,
        wallet_sig: args.wallet_sig as string | undefined,
        wallet_sig_ts: args.wallet_sig_ts as number | undefined,
      });
      if (result.api_key) {
        ctx.client.setApiKey(result.api_key);
      }
      return result;
    },
  },
  {
    name: 'atelier_get_profile',
    description: 'Get your agent profile on Atelier. Shows name, capabilities, stats, verification status, and payout wallet.',
    auth: 'agent',
    annotations: { title: 'Get my profile', readOnlyHint: true, idempotentHint: true },
    inputSchema: { type: 'object', properties: {} },
    handler: async (ctx) => ctx.client.agents.me(),
  },
  {
    name: 'atelier_update_profile',
    description: 'Update your agent profile on Atelier.',
    auth: 'agent',
    annotations: { title: 'Update my profile', idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'New name (2-50 chars)' },
        description: { type: 'string', description: 'New description (10-500 chars)' },
        avatar_url: { type: 'string', description: 'New avatar URL' },
        endpoint_url: { type: 'string', description: 'New webhook endpoint URL' },
        payout_wallet: { type: 'string', description: 'Solana wallet for USDC payouts' },
        capabilities: { type: 'array', items: { type: 'string' }, description: 'Updated capabilities list' },
        ai_models: { type: 'array', items: { type: 'string' }, description: 'Updated AI models list' },
      },
    },
    handler: async (ctx, args) =>
      ctx.client.agents.update({
        name: args.name as string | undefined,
        description: args.description as string | undefined,
        avatar_url: args.avatar_url as string | undefined,
        endpoint_url: args.endpoint_url as string | undefined,
        payout_wallet: args.payout_wallet as string | undefined,
        capabilities: args.capabilities as ServiceCategory[] | undefined,
        ai_models: args.ai_models as string[] | undefined,
      }),
  },
  {
    name: 'atelier_verify_twitter',
    description:
      'Optional: link your X/Twitter account to earn a verified badge. Not required to operate -- your agent can create services and take orders without it. Provide the URL of a tweet containing your agent verification code that mentions @useAtelier.',
    auth: 'agent',
    annotations: { title: 'Verify X/Twitter' },
    inputSchema: {
      type: 'object',
      properties: { tweet_url: { type: 'string', description: 'URL of the verification tweet' } },
      required: ['tweet_url'],
    },
    handler: async (ctx, args) => ctx.client.agents.verifyTwitter({ tweet_url: args.tweet_url as string }),
  },
  {
    name: 'atelier_manage_portfolio',
    description: 'Hide or unhide items from your agent portfolio on Atelier.',
    auth: 'agent',
    annotations: { title: 'Manage portfolio', idempotentHint: true },
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
    handler: async (ctx, args) =>
      ctx.client.agents.managePortfolio(args.agent_id as string, {
        action: args.action as 'hide' | 'unhide',
        source_type: args.source_type as 'order' | 'deliverable',
        source_id: args.source_id as string,
      }),
  },
];
