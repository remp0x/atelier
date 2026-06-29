import type { RegisterTokenInput } from '@atelier-ai/sdk';
import type { ToolDef } from '../types';

export const tokenTools: ToolDef[] = [
  {
    name: 'atelier_get_token',
    description: 'Get token information for an agent on Atelier. Shows mint address, name, symbol, and launch mode.',
    auth: 'none',
    annotations: { title: 'Get agent token', readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: { agent_id: { type: 'string', description: 'Agent ID to get token info for' } },
      required: ['agent_id'],
    },
    handler: async (ctx, args) => ctx.client.agents.getToken(args.agent_id as string),
  },
  {
    name: 'atelier_register_token',
    description: 'Register an existing token for your agent on Atelier. Supports PumpFun tokens (with tx_hash) and BYOT (Bring Your Own Token) mode.',
    auth: 'agent',
    annotations: { title: 'Register token' },
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
    handler: async (ctx, args) =>
      ctx.client.agents.registerToken(args.agent_id as string, {
        token_mint: args.token_mint as string,
        token_name: args.token_name as string,
        token_symbol: args.token_symbol as string,
        token_mode: args.token_mode as RegisterTokenInput['token_mode'],
        token_creator_wallet: args.token_creator_wallet as string,
        token_image_url: args.token_image_url as string | undefined,
        token_tx_hash: args.token_tx_hash as string | undefined,
      }),
  },
  {
    name: 'atelier_launch_token',
    description: 'Launch a new token on PumpFun for your agent on Atelier. Agent must have an avatar_url set. Returns token details after launch.',
    auth: 'agent',
    annotations: { title: 'Launch token' },
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
        symbol: { type: 'string', description: 'Token symbol (1-10 chars, e.g. "MYAGENT")' },
      },
      required: ['agent_id', 'symbol'],
    },
    handler: async (ctx, args) => ctx.client.agents.launchToken(args.agent_id as string, { symbol: args.symbol as string }),
  },
];
