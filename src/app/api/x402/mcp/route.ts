export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServices, getServiceById, type ServiceCategory } from '@/lib/atelier-db';
import { buildPaymentRequirements, computeTotalWithFee, type PaymentChain } from '@/lib/x402';
import { isX402PayableService } from '@/lib/x402-resource';
import { rateLimiters } from '@/lib/rateLimit';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'atelier';
const SERVER_VERSION = '1.0.0';
const DEFAULT_SITE_ORIGIN = 'https://atelierai.xyz';

const VALID_CATEGORIES: ServiceCategory[] = ['image_gen', 'video_gen', 'ugc', 'influencer', 'brand_content', 'coding', 'analytics', 'seo', 'trading', 'automation', 'consulting', 'custom'];
const VALID_CHAINS: PaymentChain[] = ['solana', 'base'];

const RPC_PARSE_ERROR = -32700;
const RPC_INVALID_REQUEST = -32600;
const RPC_METHOD_NOT_FOUND = -32601;
const RPC_INVALID_PARAMS = -32602;
const RPC_INTERNAL_ERROR = -32603;

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

interface JsonRpcError {
  code: number;
  message: string;
}

interface McpTextContent {
  type: 'text';
  text: string;
}

interface McpToolResult {
  content: McpTextContent[];
  isError?: boolean;
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const TOOLS: McpTool[] = [
  {
    name: 'search_agents',
    description: 'Search Atelier agent services available for hire. Returns matching services with pricing and payment URLs.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Substring to match against service title, agent name, or category.' },
        category: {
          type: 'string',
          description: 'Filter by service category.',
          enum: VALID_CATEGORIES,
        },
        limit: { type: 'number', description: 'Maximum number of results (1-50, default 20).' },
      },
      required: [],
    },
  },
  {
    name: 'hire_agent',
    description: 'Get x402 USDC payment instructions to hire an Atelier agent for a given service and brief.',
    inputSchema: {
      type: 'object',
      properties: {
        service_id: { type: 'string', description: 'The service_id of the Atelier agent service to hire.' },
        brief: { type: 'string', description: 'A description of the work you want the agent to perform.' },
        chain: {
          type: 'string',
          description: "Payment chain. Defaults to 'solana'.",
          enum: VALID_CHAINS,
        },
      },
      required: ['service_id', 'brief'],
    },
  },
];

function resolveOrigin(request: NextRequest): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  try {
    return request.nextUrl.origin.replace(/\/$/, '');
  } catch {
    return DEFAULT_SITE_ORIGIN;
  }
}

function jsonRpcResult(id: JsonRpcId, result: unknown): NextResponse {
  return NextResponse.json({ jsonrpc: '2.0', id, result });
}

function jsonRpcError(id: JsonRpcId, error: JsonRpcError): NextResponse {
  return NextResponse.json({ jsonrpc: '2.0', id, error });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!isRecord(value)) return false;
  if (value.jsonrpc !== '2.0') return false;
  if (typeof value.method !== 'string') return false;
  return true;
}

function textResult(text: string, isError = false): McpToolResult {
  return { content: [{ type: 'text', text }], isError };
}

async function handleSearchAgents(params: unknown, origin: string): Promise<McpToolResult> {
  const args = isRecord(params) ? params : {};

  const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';

  let category: ServiceCategory | undefined;
  if (typeof args.category === 'string') {
    if (!VALID_CATEGORIES.includes(args.category as ServiceCategory)) {
      return textResult(`Invalid category: ${args.category}`, true);
    }
    category = args.category as ServiceCategory;
  }

  let limit = 20;
  if (typeof args.limit === 'number' && Number.isFinite(args.limit)) {
    limit = Math.min(Math.max(Math.floor(args.limit), 1), 50);
  }

  const services = await getServices({
    category,
    pricing: 'onetime',
    sortBy: 'popular',
    limit,
  });

  const results = services
    .filter(isX402PayableService)
    .filter((s) => {
      if (!query) return true;
      const haystack = `${s.title} ${s.agent_name} ${s.category}`.toLowerCase();
      return haystack.includes(query);
    })
    .map((s) => {
      const totals = computeTotalWithFee(s.price_usd);
      return {
        service_id: s.id,
        title: s.title,
        category: s.category,
        agent_name: s.agent_name,
        agent_slug: s.agent_slug,
        price_usd: totals.priceUsd,
        total_charged_usd: totals.totalUsd,
        discover_url: `${origin}/api/x402/discover?service_id=${s.id}`,
        pay_url: `${origin}/api/x402/pay?service_id=${s.id}`,
      };
    });

  return textResult(JSON.stringify(results, null, 2));
}

async function handleHireAgent(params: unknown): Promise<McpToolResult> {
  const args = isRecord(params) ? params : {};

  const serviceId = typeof args.service_id === 'string' ? args.service_id.trim() : '';
  if (!serviceId) {
    return textResult('Missing required parameter: service_id', true);
  }

  const brief = typeof args.brief === 'string' ? args.brief.trim() : '';
  if (!brief) {
    return textResult('Missing required parameter: brief', true);
  }

  let chain: PaymentChain = 'solana';
  if (typeof args.chain === 'string') {
    if (!VALID_CHAINS.includes(args.chain as PaymentChain)) {
      return textResult(`Unsupported chain: ${args.chain}`, true);
    }
    chain = args.chain as PaymentChain;
  }

  const service = await getServiceById(serviceId);
  if (!service || !service.active) {
    return textResult(`Service not found or inactive: ${serviceId}`, true);
  }
  if (!isX402PayableService(service)) {
    return textResult('This service is not payable via x402 (quote-based or zero-price). Use the standard order flow.', true);
  }

  let requirements;
  try {
    requirements = buildPaymentRequirements({
      priceUsd: service.price_usd,
      serviceTitle: service.title,
      serviceId: service.id,
      chain,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build payment requirements';
    return textResult(`Cannot build payment requirements for chain '${chain}': ${message}`, true);
  }

  const totals = computeTotalWithFee(service.price_usd);

  const payload = {
    service_id: service.id,
    title: service.title,
    agent_name: service.agent_name,
    brief,
    price_usd: totals.priceUsd,
    total_charged_usd: totals.totalUsd,
    payment_requirements: {
      payTo: requirements.payTo,
      maxAmountRequired: requirements.maxAmountRequired,
      asset: requirements.asset,
      network: requirements.network,
      scheme: requirements.scheme,
    },
    instructions:
      'Pay this USDC amount, then POST to /api/x402/pay (or /api/orders) with header X-PAYMENT: <tx signature/hash>, X-Payment-Network: ' +
      requirements.network +
      ', and JSON body { service_id, brief, requirements }.',
    requirements,
  };

  return textResult(JSON.stringify(payload, null, 2));
}

async function handleToolsCall(id: JsonRpcId, params: unknown, origin: string): Promise<NextResponse> {
  if (!isRecord(params) || typeof params.name !== 'string') {
    return jsonRpcError(id, { code: RPC_INVALID_PARAMS, message: 'Missing tool name' });
  }

  const toolArgs = params.arguments;

  if (params.name === 'search_agents') {
    const result = await handleSearchAgents(toolArgs, origin);
    return jsonRpcResult(id, result);
  }

  if (params.name === 'hire_agent') {
    const result = await handleHireAgent(toolArgs);
    return jsonRpcResult(id, result);
  }

  return jsonRpcError(id, { code: RPC_INVALID_PARAMS, message: `Unknown tool: ${params.name}` });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = resolveOrigin(request);
  return NextResponse.json({
    name: SERVER_NAME,
    version: SERVER_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    transport: 'http',
    endpoint: `${origin}/api/x402/mcp`,
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rl = rateLimiters.services(request);
  if (rl) return rl;

  const origin = resolveOrigin(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonRpcError(null, { code: RPC_PARSE_ERROR, message: 'Parse error: invalid JSON' });
  }

  if (!isJsonRpcRequest(body)) {
    return jsonRpcError(null, { code: RPC_INVALID_REQUEST, message: 'Invalid Request: not a valid JSON-RPC 2.0 envelope' });
  }

  const id: JsonRpcId = body.id ?? null;

  try {
    switch (body.method) {
      case 'initialize':
        return jsonRpcResult(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        });

      case 'notifications/initialized':
        return jsonRpcResult(id, {});

      case 'ping':
        return jsonRpcResult(id, {});

      case 'tools/list':
        return jsonRpcResult(id, { tools: TOOLS });

      case 'tools/call':
        return await handleToolsCall(id, body.params, origin);

      default:
        return jsonRpcError(id, { code: RPC_METHOD_NOT_FOUND, message: `Method not found: ${body.method}` });
    }
  } catch (error) {
    console.error('x402 mcp error:', error);
    const message = error instanceof Error ? error.message : 'Internal error';
    return jsonRpcError(id, { code: RPC_INTERNAL_ERROR, message });
  }
}
