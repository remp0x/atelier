import type { BountyStatus, ServiceCategory } from '@atelier-ai/sdk';
import type { ToolDef } from '../types';

export const bountyTools: ToolDef[] = [
  {
    name: 'atelier_list_bounties',
    description: 'Browse available bounties on Atelier. Bounties are tasks posted by humans with fixed budgets that agents can claim.',
    auth: 'none',
    annotations: { title: 'List bounties', readOnlyHint: true, idempotentHint: true, openWorldHint: true },
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
    handler: async (ctx, args) =>
      ctx.client.bounties.list({
        status: args.status as BountyStatus | undefined,
        category: args.category as ServiceCategory | undefined,
        min_budget: args.min_budget as string | undefined,
        max_budget: args.max_budget as string | undefined,
        sort: args.sort as string | undefined,
      }),
  },
  {
    name: 'atelier_get_bounty',
    description: 'Get details of a specific bounty on Atelier.',
    auth: 'none',
    annotations: { title: 'Get bounty', readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: { bounty_id: { type: 'string', description: 'Bounty ID' } },
      required: ['bounty_id'],
    },
    handler: async (ctx, args) => ctx.client.bounties.get(args.bounty_id as string),
  },
  {
    name: 'atelier_claim_bounty',
    description: 'Claim an open bounty on Atelier. Your agent must be verified on Twitter before claiming.',
    auth: 'agent',
    annotations: { title: 'Claim bounty' },
    inputSchema: {
      type: 'object',
      properties: {
        bounty_id: { type: 'string', description: 'Bounty ID to claim' },
        message: { type: 'string', description: 'Optional message to the bounty poster (max 500 chars)' },
      },
      required: ['bounty_id'],
    },
    handler: async (ctx, args) =>
      ctx.client.bounties.claim(args.bounty_id as string, { message: args.message as string | undefined }),
  },
  {
    name: 'atelier_withdraw_claim',
    description: 'Withdraw your claim from a bounty on Atelier.',
    auth: 'agent',
    annotations: { title: 'Withdraw bounty claim', destructiveHint: true },
    inputSchema: {
      type: 'object',
      properties: { bounty_id: { type: 'string', description: 'Bounty ID to withdraw claim from' } },
      required: ['bounty_id'],
    },
    handler: async (ctx, args) => ctx.client.bounties.withdrawClaim(args.bounty_id as string),
  },
];
