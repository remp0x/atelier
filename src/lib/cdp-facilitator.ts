import { createPrivateKey, sign as cryptoSign, randomBytes, type KeyObject } from 'crypto';
import { USDC_BASE_ADDRESS } from '@/lib/base-server';
import type { PaymentRequirements } from '@/lib/x402';

export const CDP_FACILITATOR_ENABLED: boolean = !!(
  process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET
);

const DEFAULT_FACILITATOR_URL = 'https://api.cdp.coinbase.com/platform/v2/x402';

export interface CdpFacilitatorConfig {
  baseUrl: string;
  enabled: boolean;
}

export function cdpFacilitatorConfig(): CdpFacilitatorConfig {
  return {
    baseUrl: process.env.CDP_FACILITATOR_URL || DEFAULT_FACILITATOR_URL,
    enabled: CDP_FACILITATOR_ENABLED,
  };
}

// --- Discovery declaration (used by /api/x402/bazaar; informational only) ---

export interface DiscoverableResource {
  resource: string;
  type: 'http';
  x402Version: number;
  accepts: PaymentRequirements[];
  lastUpdated: string;
  metadata: {
    description: string;
    input?: unknown;
    output?: unknown;
  };
}

export function buildDiscoverableResource(params: {
  resource: string;
  description: string;
  accepts: PaymentRequirements[];
  input?: unknown;
  output?: unknown;
  lastUpdated: string;
}): DiscoverableResource {
  return {
    resource: params.resource,
    type: 'http',
    x402Version: 1,
    accepts: params.accepts,
    lastUpdated: params.lastUpdated,
    metadata: {
      description: params.description,
      input: params.input,
      output: params.output,
    },
  };
}

// --- CDP JWT auth (dependency-free; mirrors @coinbase/cdp-sdk generateJwt) ---

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface CdpSigningKey {
  key: KeyObject;
  alg: 'EdDSA' | 'ES256';
}

function loadCdpSigningKey(secret: string): CdpSigningKey {
  if (secret.includes('BEGIN')) {
    return { key: createPrivateKey(secret), alg: 'ES256' };
  }
  const raw = Buffer.from(secret, 'base64');
  if (raw.length === 64) {
    const seed = raw.subarray(0, 32);
    const pub = raw.subarray(32);
    const key = createPrivateKey({
      key: { kty: 'OKP', crv: 'Ed25519', d: base64url(seed), x: base64url(pub) },
      format: 'jwk',
    });
    return { key, alg: 'EdDSA' };
  }
  throw new Error('Unrecognized CDP_API_KEY_SECRET format (expected base64 Ed25519 64-byte key or EC PEM)');
}

export function generateCdpJwt(method: string, endpointUrl: string): string {
  const keyId = process.env.CDP_API_KEY_ID || '';
  const secret = process.env.CDP_API_KEY_SECRET || '';
  if (!keyId || !secret) {
    throw new Error('CDP_API_KEY_ID and CDP_API_KEY_SECRET are required to sign a CDP JWT');
  }

  const { key, alg } = loadCdpSigningKey(secret);
  const url = new URL(endpointUrl);
  const uri = `${method.toUpperCase()} ${url.host}${url.pathname}`;
  const nonce = randomBytes(16).toString('hex');
  const issuedAt = Math.floor(Date.now() / 1000);

  const header = { alg, kid: keyId, typ: 'JWT', nonce };
  const claims = {
    sub: keyId,
    iss: 'cdp',
    nbf: issuedAt,
    iat: issuedAt,
    exp: issuedAt + 120,
    uris: [uri],
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature =
    alg === 'EdDSA'
      ? cryptoSign(null, Buffer.from(signingInput), key)
      : cryptoSign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' });

  return `${signingInput}.${base64url(signature)}`;
}

function cdpAuthHeaders(method: string, endpointUrl: string): Record<string, string> {
  return { Authorization: `Bearer ${generateCdpJwt(method, endpointUrl)}` };
}

// --- CDP v1 PaymentRequirements + payment payload ---

export interface CdpPaymentRequirements {
  scheme: 'exact';
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  outputSchema?: Record<string, unknown>;
  extra?: { name: string; version: string };
}

// Base mainnet USDC EIP-712 domain (transferWithAuthorization / EIP-3009).
const BASE_USDC_EIP712 = { name: 'USD Coin', version: '2' };

export function buildCdpBasePaymentRequirements(params: {
  totalUsd: number;
  payTo: string;
  resource: string;
  description: string;
  outputSchema?: Record<string, unknown>;
}): CdpPaymentRequirements {
  const atomicAmount = String(Math.round(params.totalUsd * 1_000_000));
  return {
    scheme: 'exact',
    network: 'base',
    maxAmountRequired: atomicAmount,
    resource: params.resource,
    description: params.description,
    mimeType: 'application/json',
    payTo: params.payTo,
    maxTimeoutSeconds: 60,
    asset: USDC_BASE_ADDRESS,
    outputSchema: params.outputSchema,
    extra: BASE_USDC_EIP712,
  };
}

export function buildCdp402Response(requirements: CdpPaymentRequirements, error: string): Response {
  return new Response(
    JSON.stringify({ x402Version: 1, error, accepts: [requirements] }),
    {
      status: 402,
      headers: {
        'Content-Type': 'application/json',
        'X-Payment-Scheme': 'exact',
        'X-Payment-Network': requirements.network,
        'X-Payment-Asset': 'USDC',
      },
    },
  );
}

export function decodeXPaymentPayload(header: string | null): Record<string, unknown> | null {
  if (!header) return null;
  try {
    const json = Buffer.from(header.trim(), 'base64').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && 'scheme' in parsed && 'payload' in parsed) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export interface CdpVerifyResult {
  isValid: boolean;
  payer?: string;
  invalidReason?: string;
  error?: string;
}

export interface CdpSettleResult {
  success: boolean;
  transaction?: string;
  network?: string;
  payer?: string;
  errorReason?: string;
  error?: string;
}

export function encodeXPaymentResponse(result: CdpSettleResult): string {
  return Buffer.from(
    JSON.stringify({
      success: result.success,
      transaction: result.transaction ?? '',
      network: result.network ?? 'base',
      payer: result.payer ?? '',
    }),
  ).toString('base64');
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

async function cdpPost(
  endpointPath: 'verify' | 'settle',
  paymentPayload: unknown,
  paymentRequirements: CdpPaymentRequirements,
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const endpoint = `${cdpFacilitatorConfig().baseUrl}/${endpointPath}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...cdpAuthHeaders('POST', endpoint),
    },
    body: JSON.stringify({ x402Version: 1, paymentPayload, paymentRequirements }),
  });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: response.status, body };
}

export async function verifyViaCdpFacilitator(args: {
  paymentPayload: unknown;
  paymentRequirements: CdpPaymentRequirements;
}): Promise<CdpVerifyResult> {
  if (!CDP_FACILITATOR_ENABLED) {
    return { isValid: false, error: 'CDP facilitator not configured' };
  }
  try {
    const { status, body } = await cdpPost('verify', args.paymentPayload, args.paymentRequirements);
    if (!body) {
      return { isValid: false, error: `CDP verify returned no body (status ${status})` };
    }
    return {
      isValid: body.isValid === true,
      payer: asString(body.payer),
      invalidReason: asString(body.invalidReason),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'CDP verify error';
    console.error('verifyViaCdpFacilitator error:', message);
    return { isValid: false, error: message };
  }
}

export async function settleViaCdpFacilitator(args: {
  paymentPayload: unknown;
  paymentRequirements: CdpPaymentRequirements;
}): Promise<CdpSettleResult> {
  if (!CDP_FACILITATOR_ENABLED) {
    return { success: false, error: 'CDP facilitator not configured' };
  }
  try {
    const { status, body } = await cdpPost('settle', args.paymentPayload, args.paymentRequirements);
    if (!body) {
      return { success: false, error: `CDP settle returned no body (status ${status})` };
    }
    return {
      success: body.success === true,
      transaction: asString(body.transaction),
      network: asString(body.network),
      payer: asString(body.payer),
      errorReason: asString(body.errorReason),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'CDP settle error';
    console.error('settleViaCdpFacilitator error:', message);
    return { success: false, error: message };
  }
}
