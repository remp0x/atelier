import type { ServiceCategory, ServicePriceType, UpdateServiceInput } from '@useatelier/sdk';
import type { ToolDef } from '../types';

export const serviceTools: ToolDef[] = [
  {
    name: 'atelier_list_services',
    description: 'List services for a specific agent on Atelier.',
    auth: 'none',
    annotations: { title: 'List agent services', readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: { agent_id: { type: 'string', description: 'Agent ID to list services for' } },
      required: ['agent_id'],
    },
    handler: async (ctx, args) => ctx.client.services.listForAgent(args.agent_id as string),
  },
  {
    name: 'atelier_create_service',
    description:
      'Create a new service listing on Atelier. IMPORTANT: Before calling this tool, confirm the following with the user: category, title, description, price_usd, and price_type. Do not invent values for these fields. Optional fields (turnaround_hours, deliverables, demo_url) can be set by the AI if the user opts for full autonomy.',
    auth: 'agent',
    annotations: { title: 'Create service' },
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
        category: { type: 'string', description: 'Service category: image_gen, video_gen, ugc, influencer, brand_content, coding, analytics, seo, trading, automation, consulting, custom' },
        title: { type: 'string', description: 'Service title (5-80 chars, plain text, no emoji)' },
        description: { type: 'string', description: 'Service description (40-1000 chars: what it delivers, how, for whom)' },
        price_usd: { type: 'string', description: 'Price in USD (e.g. "5.00")' },
        price_type: { type: 'string', description: 'Pricing model: fixed, quote, weekly, monthly (default: fixed)' },
        turnaround_hours: { type: 'number', description: 'Expected turnaround in hours (default: 48)' },
        deliverables: { type: 'array', items: { type: 'string' }, description: 'List of what the client receives' },
        demo_url: { type: 'string', description: 'Demo/sample URL' },
      },
      required: ['agent_id', 'category', 'title', 'description', 'price_usd'],
    },
    handler: async (ctx, args) => {
      const agentId = args.agent_id as string;
      return ctx.client.services.create(agentId, {
        category: args.category as ServiceCategory,
        title: args.title as string,
        description: args.description as string,
        price_usd: args.price_usd as string,
        price_type: args.price_type as ServicePriceType | undefined,
        turnaround_hours: args.turnaround_hours as number | undefined,
        deliverables: args.deliverables as string[] | undefined,
        demo_url: args.demo_url as string | undefined,
      });
    },
  },
  {
    name: 'atelier_update_service',
    description: 'Update an existing service listing on Atelier. Only provide the fields you want to change.',
    auth: 'agent',
    annotations: { title: 'Update service', idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        service_id: { type: 'string', description: 'Service ID to update' },
        category: { type: 'string', description: 'Service category: image_gen, video_gen, ugc, influencer, brand_content, coding, analytics, seo, trading, automation, consulting, custom' },
        title: { type: 'string', description: 'Service title (5-80 chars, plain text, no emoji)' },
        description: { type: 'string', description: 'Service description (40-1000 chars: what it delivers, how, for whom)' },
        price_usd: { type: 'string', description: 'Price in USD (e.g. "5.00")' },
        price_type: { type: 'string', description: 'Pricing model: fixed, quote, weekly, monthly' },
        turnaround_hours: { type: 'number', description: 'Expected turnaround in hours' },
        deliverables: { type: 'array', items: { type: 'string' }, description: 'List of what the client receives' },
        demo_url: { type: 'string', description: 'Demo/sample URL (null to remove)' },
        quota_limit: { type: 'number', description: 'Max orders (0 = unlimited)' },
        max_revisions: { type: 'number', description: 'Max revisions allowed (0-10)' },
      },
      required: ['service_id'],
    },
    handler: async (ctx, args) => {
      const serviceId = args.service_id as string;
      const { service_id: _omit, ...input } = args;
      return ctx.client.services.update(serviceId, input as UpdateServiceInput);
    },
  },
  {
    name: 'atelier_delete_service',
    description: 'Deactivate a service listing on Atelier. The service will no longer appear in the marketplace.',
    auth: 'agent',
    annotations: { title: 'Deactivate service', destructiveHint: true, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: { service_id: { type: 'string', description: 'Service ID to deactivate' } },
      required: ['service_id'],
    },
    handler: async (ctx, args) => ctx.client.services.delete(args.service_id as string),
  },
];
