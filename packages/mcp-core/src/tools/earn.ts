import type { ToolDef } from '../types';
import { fetchJson, authHeaders, unwrap } from './http';

export const earnTools: ToolDef[] = [
  {
    name: 'atelier_earn_markets',
    description:
      'List Atelier Earn venues/markets where idle USDC earns yield (Parquet LP, lending, ...). Returns each market with live APR, TVL, whether it is depositable, and the `treasury_wallet` you send USDC to when depositing. Call this first before depositing.',
    auth: 'none',
    annotations: { title: 'Earn markets', readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { type: 'object', properties: {} },
    handler: async (ctx) => unwrap(await fetchJson(`${ctx.baseUrl}/api/earn/parquet/markets`)),
  },
  {
    name: 'atelier_earn_positions',
    description: 'List your active Atelier Earn positions with live USD value, shares, and principal.',
    auth: 'agent',
    annotations: { title: 'Earn positions', readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { type: 'object', properties: {} },
    handler: async (ctx) =>
      unwrap(await fetchJson(`${ctx.baseUrl}/api/earn/parquet/positions`, { headers: authHeaders(ctx) })),
  },
  {
    name: 'atelier_earn_deposit',
    description:
      'Deposit USDC into an Atelier Earn market to earn yield (push model). STEPS: (1) call atelier_earn_markets to get the `treasury_wallet` and the `key`/`market` you want; (2) send the USDC on Solana from your own wallet to that treasury_wallet; (3) call this with amount_usd + the transfer signature as incoming_tx_hash. The server verifies the transfer, deploys it, and mints your shares.',
    auth: 'agent',
    annotations: { title: 'Earn deposit', openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        amount_usd: { type: 'string', description: 'USD amount deposited (must equal the USDC you sent), e.g. "100.00".' },
        incoming_tx_hash: { type: 'string', description: 'Solana signature of your USDC transfer to the treasury_wallet.' },
        key: { type: 'string', description: 'Market key from earn_markets (e.g. "parquet:usdc" or "solend:usdc"). Optional; defaults to parquet.' },
        venue: { type: 'string', description: 'Venue id (alternative to key), e.g. "parquet". Optional.' },
        market: { type: 'string', description: 'Market id within the venue (alternative to key). Optional.' },
        slippage_bps: { type: 'number', description: 'Max slippage in basis points (optional).' },
      },
      required: ['amount_usd', 'incoming_tx_hash'],
    },
    handler: async (ctx, args) =>
      unwrap(
        await fetchJson(`${ctx.baseUrl}/api/earn/parquet/deposit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(ctx) },
          body: JSON.stringify({
            amount_usd: args.amount_usd,
            incoming_tx_hash: args.incoming_tx_hash,
            key: args.key,
            venue: args.venue,
            market: args.market,
            slippage_bps: args.slippage_bps,
          }),
        }),
      ),
  },
  {
    name: 'atelier_earn_withdraw',
    description:
      'Withdraw from an Atelier Earn position by burning vault shares. Pass `shares` (integer string from earn_positions) or `all: true`. USDC is sent to destination_wallet, or falls back to your agent payout/owner wallet. If pool liquidity is short the withdrawal is queued and settles as liquidity arrives.',
    auth: 'agent',
    annotations: { title: 'Earn withdraw', openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        shares: { type: 'string', description: 'Integer share amount to burn (from earn_positions). Omit if using all.' },
        all: { type: 'boolean', description: 'Withdraw the entire position. Overrides shares.' },
        key: { type: 'string', description: 'Position market key (the pool_market from earn_positions). Optional; defaults to parquet.' },
        venue: { type: 'string', description: 'Venue id (alternative to key). Optional.' },
        market: { type: 'string', description: 'Market id (alternative to key). Optional.' },
        destination_wallet: { type: 'string', description: 'Solana address to receive USDC. Optional; defaults to your payout/owner wallet.' },
        slippage_bps: { type: 'number', description: 'Max slippage in basis points (optional).' },
      },
    },
    handler: async (ctx, args) =>
      unwrap(
        await fetchJson(`${ctx.baseUrl}/api/earn/parquet/withdraw`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(ctx) },
          body: JSON.stringify({
            shares: args.shares,
            all: args.all,
            key: args.key,
            venue: args.venue,
            market: args.market,
            destination_wallet: args.destination_wallet,
            slippage_bps: args.slippage_bps,
          }),
        }),
      ),
  },
];
