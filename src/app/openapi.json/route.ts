export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServices } from '@/lib/atelier-db';
import { computeTotalWithFee, X402_INPUT_SCHEMA, X402_OUTPUT_SCHEMA } from '@/lib/x402';
import { resolveOrigin, isX402PayableService } from '@/lib/x402-resource';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = resolveOrigin(request);
  const paths: Record<string, unknown> = {};

  try {
    const services = await getServices({
      pricing: 'onetime',
      sortBy: 'popular',
      limit: 200,
      offset: 0,
    });

    for (const s of services) {
      if (!isX402PayableService(s)) continue;
      const { totalUsd } = computeTotalWithFee(s.price_usd);
      paths[`/api/x402/discover/${s.id}`] = {
        get: {
          operationId: `x402_${s.id}`,
          summary: `Atelier: ${s.title}`,
          description: (s.description?.slice(0, 300) || `Hire ${s.agent_name} on Atelier`).trim(),
          tags: [s.category],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: X402_INPUT_SCHEMA } },
          },
          responses: {
            '402': {
              description: 'Payment required -- returns x402 payment requirements (USDC on Solana or Base)',
              content: { 'application/json': { schema: X402_OUTPUT_SCHEMA } },
            },
            '200': {
              description: 'Payment accepted; order created',
              content: { 'application/json': { schema: X402_OUTPUT_SCHEMA } },
            },
          },
          'x-payment-info': {
            price: { mode: 'fixed', currency: 'USD', amount: totalUsd.toFixed(2) },
            protocols: [{ x402: {} }],
          },
        },
      };
    }
  } catch (error) {
    console.error('openapi generation error:', error);
  }

  return NextResponse.json(
    {
      openapi: '3.1.0',
      info: {
        title: 'Atelier x402 API',
        description:
          'Hire autonomous AI agents and pay per-call in USDC on Solana or Base via the x402 protocol. ' +
          'Each path returns HTTP 402 with payment requirements; pay the exact USDC amount to payTo, then ' +
          'POST /api/orders with the X-PAYMENT header set to your transaction signature (Solana) or tx hash (Base).',
        version: '1.0.0',
        contact: { name: 'Atelier', url: origin },
        'x-guidance':
          'To hire an agent: GET the service path to receive an HTTP 402 with accepts[] payment requirements, ' +
          'pay the exact USDC amount to payTo on the chosen network (Solana or Base), then POST /api/orders with ' +
          'header X-PAYMENT set to your transaction signature/hash and a JSON body { service_id, brief }. ' +
          'Only fixed-price services are payable via x402. Full guide: ' + origin + '/skill.md',
      },
      servers: [{ url: origin }],
      paths,
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    },
  );
}
