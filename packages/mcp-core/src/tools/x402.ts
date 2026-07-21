import type { ToolContext } from '../context';
import type { ToolDef } from '../types';
import { fetchJson, isRecord } from './http';

export const x402Tools: ToolDef[] = [
  {
    name: 'atelier_search_agents',
    description:
      'Search Atelier agent services available for hire. Returns matching services with pricing and the discover/pay URLs you use to hire them via x402 USDC payment.',
    auth: 'none',
    annotations: { title: 'Search services', readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Substring to match against service title, agent name, or category.' },
        category: { type: 'string', description: 'Filter by service category (image_gen, video_gen, ugc, coding, ...).' },
        limit: { type: 'number', description: 'Maximum number of results (1-50, default 20).' },
      },
    },
    handler: async (ctx: ToolContext, args) => {
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
      const params = new URLSearchParams({ pricing: 'onetime', sortBy: 'popular', limit: String(limit) });
      if (typeof args.query === 'string' && args.query.trim()) params.set('search', args.query.trim());
      if (typeof args.category === 'string' && args.category.trim()) params.set('category', args.category.trim());

      const outcome = await fetchJson(`${ctx.baseUrl}/api/services?${params.toString()}`);
      const data = isRecord(outcome.body) && Array.isArray(outcome.body.data) ? outcome.body.data : [];

      return data
        .filter(isRecord)
        .filter((s) => Number(s.price_usd) > 0)
        .map((s) => ({
          service_id: s.id,
          title: s.title,
          category: s.category,
          agent_name: s.agent_name,
          agent_slug: s.agent_slug,
          price_usd: s.price_usd,
          price_type: s.price_type,
          discover_url: `${ctx.baseUrl}/api/x402/discover/${String(s.id)}`,
          pay_url: `${ctx.baseUrl}/api/x402/pay?service_id=${String(s.id)}`,
        }));
    },
  },
  {
    name: 'atelier_get_payment_requirements',
    description:
      'Get the x402 payment requirements (the 402 challenge) for an Atelier service before hiring: amount, asset, network, and payTo address. Assets: USDC on Solana/Base, USDG on Robinhood Chain. Then pay on-chain and call atelier_submit_payment with the tx signature.',
    auth: 'none',
    annotations: { title: 'Get payment requirements', readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        service_id: { type: 'string', description: 'The service_id to get payment requirements for.' },
        chain: { type: 'string', description: "Payment chain: 'solana' (default), 'base', or 'robinhood' (Robinhood Chain, pays in USDG)." },
      },
      required: ['service_id'],
    },
    handler: async (ctx, args) => {
      const serviceId = String(args.service_id ?? '').trim();
      if (!serviceId) throw new Error('Missing required parameter: service_id');
      const chain = typeof args.chain === 'string' ? args.chain : 'solana';
      const outcome = await fetchJson(
        `${ctx.baseUrl}/api/x402/discover/${encodeURIComponent(serviceId)}?chain=${encodeURIComponent(chain)}`,
        { headers: { Accept: 'application/json' } },
      );
      return { http_status: outcome.status, ...(isRecord(outcome.body) ? outcome.body : { challenge: outcome.body }) };
    },
  },
  {
    name: 'atelier_submit_payment',
    description:
      'Finalize hiring an Atelier agent after paying on-chain. Submit the x402 payment proof (transaction signature/hash) plus your brief; this creates the paid order, settles the provider payout, and returns the order_id + status_url. Get the amount/address first via atelier_get_payment_requirements.',
    auth: 'none',
    annotations: { title: 'Submit payment / finalize hire', openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        service_id: { type: 'string', description: 'The service_id you are paying for.' },
        brief: { type: 'string', description: 'Description of the work you want the agent to perform.' },
        tx_signature: { type: 'string', description: 'On-chain payment proof: Solana tx signature or EVM (Base / Robinhood Chain) 0x tx hash.' },
        chain: { type: 'string', description: "Payment network: 'solana' (-> solana-mainnet), 'base' (-> base-mainnet), or 'robinhood' (-> robinhood-mainnet). Auto-detected if omitted, EXCEPT Robinhood Chain: 0x hashes default to Base, so always pass 'robinhood' when you paid there." },
      },
      required: ['service_id', 'brief', 'tx_signature'],
    },
    handler: async (ctx, args) => {
      const serviceId = String(args.service_id ?? '').trim();
      const brief = String(args.brief ?? '').trim();
      const txSignature = String(args.tx_signature ?? '').trim();
      if (!serviceId) throw new Error('Missing required parameter: service_id');
      if (!brief) throw new Error('Missing required parameter: brief');
      if (!txSignature) throw new Error('Missing required parameter: tx_signature');

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-PAYMENT': txSignature,
        'X-Atelier-Brief': brief,
      };
      if (typeof args.chain === 'string' && args.chain) {
        headers['X-Payment-Network'] =
          args.chain === 'base' ? 'base-mainnet'
          : args.chain === 'robinhood' ? 'robinhood-mainnet'
          : 'solana-mainnet';
      }
      if (ctx.apiKey) headers['Authorization'] = `Bearer ${ctx.apiKey}`;

      const outcome = await fetchJson(`${ctx.baseUrl}/api/x402/pay?service_id=${encodeURIComponent(serviceId)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ service_id: serviceId, brief }),
      });
      return { http_status: outcome.status, ...(isRecord(outcome.body) ? outcome.body : { response: outcome.body }) };
    },
  },
];
