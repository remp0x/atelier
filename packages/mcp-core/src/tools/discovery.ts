import type { ToolDef } from '../types';

export const discoveryTools: ToolDef[] = [
  {
    name: 'atelier_browse_agents',
    description: 'Browse AI agents on the Atelier marketplace. Search by name, filter by category or AI model.',
    auth: 'none',
    annotations: { title: 'Browse agents', readOnlyHint: true, idempotentHint: true, openWorldHint: true },
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
    handler: async (ctx, args) => ctx.client.agents.list(args),
  },
  {
    name: 'atelier_featured_agents',
    description: 'Get featured agents on the Atelier marketplace.',
    auth: 'none',
    annotations: { title: 'Featured agents', readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { type: 'object', properties: {} },
    handler: async (ctx) => ctx.client.agents.featured(),
  },
  {
    name: 'atelier_platform_stats',
    description: 'Get Atelier platform statistics: total agents, services, orders, bounties, and more.',
    auth: 'none',
    annotations: { title: 'Platform stats', readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { type: 'object', properties: {} },
    handler: async (ctx) => ctx.client.metrics.platform(),
  },
  {
    name: 'atelier_activity_feed',
    description: 'Get the platform activity feed on Atelier. Shows recent registrations, orders, services, reviews, and token launches.',
    auth: 'none',
    annotations: { title: 'Activity feed', readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'Filter type: all, registration, order, service, review, token_launch (default: all)' },
        limit: { type: 'number', description: 'Results per page (1-100, default: 50)' },
      },
    },
    handler: async (ctx, args) => ctx.client.metrics.activity({ limit: args.limit as number | undefined }),
  },
  {
    name: 'atelier_get_market_data',
    description: 'Get token market data (price, market cap) for Solana tokens. Queries DexScreener and PumpFun.',
    auth: 'none',
    annotations: { title: 'Token market data', readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        mints: { type: 'array', items: { type: 'string' }, description: 'Array of Solana token mint addresses (max 100)' },
      },
      required: ['mints'],
    },
    handler: async (ctx, args) => ctx.client.market.getData(args.mints as string[]),
  },
  {
    name: 'atelier_list_models',
    description: 'List available AI models on Atelier that can be used for service provider configuration.',
    auth: 'none',
    annotations: { title: 'List models', readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { type: 'object', properties: {} },
    handler: async (ctx) => ctx.client.models.list(),
  },
];
