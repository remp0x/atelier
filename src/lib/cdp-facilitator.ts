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

// --- CDP x402 v2 wire format ------------------------------------------------
//
// CDP Bazaar (the index behind agentic.market) only catalogs a resource when the
// CDP Facilitator SETTLES an x402 *v2* payment whose payload carries `resource`
// and a valid `extensions.bazaar` declaration (v1 `outputSchema` discovery is
// deprecated). v2 renames `maxAmountRequired` -> `amount`, uses a CAIP-2 network
// (`eip155:8453` for Base mainnet), and moves `resource`/`description`/`mimeType`
// out of the requirement entry into a top-level `ResourceInfo` object. Shapes are
// matched to the x402 reference SDK (`@x402/core`, `@x402/extensions/bazaar`) and
// the live CDP catalog. See docs/x402-bazaar-setup.md.

export const BASE_CAIP2_NETWORK = 'eip155:8453';

// Base mainnet USDC EIP-712 domain (transferWithAuthorization / EIP-3009). These
// are the `extra` fields the buyer needs to sign; they must match the live catalog.
const BASE_USDC_EIP712 = { name: 'USD Coin', version: '2' };

export interface CdpResourceInfo {
  url: string;
  description: string;
  mimeType: string;
}

export interface CdpV2PaymentRequirements {
  scheme: 'exact';
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string };
}

export interface CdpBazaarExtension {
  info: {
    input: { type: 'http'; method: 'POST'; bodyType: 'json'; body: Record<string, unknown> };
    output: { type: 'json'; example: Record<string, unknown> };
  };
  schema: Record<string, unknown>;
}

/**
 * Builds the `extensions.bazaar` discovery declaration the CDP Facilitator
 * validates (strict JSON Schema: `info.input` must validate against
 * `schema.properties.input`). Shape mirrors `@x402/extensions/bazaar`'s
 * `declareDiscoveryExtension` for a POST/json resource.
 */
export function buildCdpBazaarExtension(params: {
  inputBody: Record<string, unknown>;
  inputProperties: Record<string, unknown>;
  outputExample: Record<string, unknown>;
}): CdpBazaarExtension {
  return {
    info: {
      input: { type: 'http', method: 'POST', bodyType: 'json', body: params.inputBody },
      output: { type: 'json', example: params.outputExample },
    },
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        input: {
          type: 'object',
          properties: {
            type: { type: 'string', const: 'http' },
            method: { type: 'string', enum: ['POST'] },
            bodyType: { type: 'string', enum: ['json', 'form-data', 'text'] },
            body: { type: 'object', properties: params.inputProperties },
          },
          required: ['type', 'method', 'bodyType', 'body'],
          additionalProperties: false,
        },
        output: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            example: { type: 'object' },
          },
          required: ['type'],
        },
      },
      required: ['input'],
    },
  };
}

export function buildCdpV2PaymentRequirements(params: {
  totalUsd: number;
  payTo: string;
}): CdpV2PaymentRequirements {
  const atomicAmount = String(Math.round(params.totalUsd * 1_000_000));
  return {
    scheme: 'exact',
    network: BASE_CAIP2_NETWORK,
    amount: atomicAmount,
    asset: USDC_BASE_ADDRESS,
    payTo: params.payTo,
    maxTimeoutSeconds: 120,
    extra: BASE_USDC_EIP712,
  };
}

/**
 * Builds the v2 HTTP 402 the buyer signs against. The same `requirements`,
 * `resource`, and `bazaar` objects are later forwarded verbatim to CDP
 * verify/settle, so the buyer's signed authorization always matches what CDP
 * validates. Emitted as JSON body and as the base64 `Payment-Required` header.
 */
export function buildCdpV2402Response(params: {
  requirements: CdpV2PaymentRequirements;
  resource: CdpResourceInfo;
  bazaar: CdpBazaarExtension;
  error: string;
}): Response {
  const serialized = JSON.stringify({
    x402Version: 2,
    error: params.error,
    accepts: [params.requirements],
    resource: params.resource,
    extensions: { bazaar: params.bazaar },
  });
  return new Response(serialized, {
    status: 402,
    headers: {
      'Content-Type': 'application/json',
      'Payment-Required': Buffer.from(serialized).toString('base64'),
      'X-Payment-Scheme': 'exact',
      'X-Payment-Network': params.requirements.network,
      'X-Payment-Asset': 'USDC',
    },
  });
}

/**
 * Re-wraps the buyer's decoded X-PAYMENT into a clean x402 v2 PaymentPayload
 * carrying `resource` + `extensions.bazaar` so the CDP Facilitator can catalog
 * the resource on settle. The EIP-3009 signature lives under `.payload` in both
 * v1 and v2 buyer payloads, so it is reused verbatim (it is not version-bound).
 */
export function buildCdpV2PaymentPayload(params: {
  buyerPayload: Record<string, unknown>;
  requirements: CdpV2PaymentRequirements;
  resource: CdpResourceInfo;
  bazaar: CdpBazaarExtension;
}): Record<string, unknown> {
  const inner = params.buyerPayload.payload;
  const signaturePayload =
    inner && typeof inner === 'object' ? inner : params.buyerPayload;
  return {
    x402Version: 2,
    resource: params.resource,
    accepted: params.requirements,
    payload: signaturePayload,
    extensions: { bazaar: params.bazaar },
  };
}

export function decodeXPaymentPayload(header: string | null): Record<string, unknown> | null {
  if (!header) return null;
  try {
    const json = Buffer.from(header.trim(), 'base64').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    // Only capture x402 v2 payloads (the CDP/Base flow): they carry `x402Version: 2`
    // and/or `accepted`, with the EIP-3009 signature nested under `payload`. This
    // deliberately excludes v1 `{scheme,network,payload}` envelopes so a base64-JSON
    // payment is never diverted away from the legacy tx-signature path.
    if (
      parsed &&
      typeof parsed === 'object' &&
      'payload' in parsed &&
      ((parsed as Record<string, unknown>).x402Version === 2 || 'accepted' in parsed)
    ) {
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
  // CDP's `EXTENSION-RESPONSES` header (or body `extensions`): `processing` means
  // the Bazaar discovery metadata was accepted, `rejected` means it failed schema
  // validation and the resource will NOT be cataloged.
  extensionResponses?: string;
}

export interface CdpSettleResult {
  success: boolean;
  transaction?: string;
  network?: string;
  payer?: string;
  errorReason?: string;
  error?: string;
  extensionResponses?: string;
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
  paymentRequirements: CdpV2PaymentRequirements,
): Promise<{ status: number; body: Record<string, unknown> | null; extensionResponses?: string }> {
  const endpoint = `${cdpFacilitatorConfig().baseUrl}/${endpointPath}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...cdpAuthHeaders('POST', endpoint),
    },
    body: JSON.stringify({ x402Version: 2, paymentPayload, paymentRequirements }),
  });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const headerExt = response.headers.get('extension-responses');
  const bodyExt =
    body && typeof body.extensions === 'object' && body.extensions !== null
      ? JSON.stringify(body.extensions)
      : undefined;
  return { status: response.status, body, extensionResponses: headerExt ?? bodyExt };
}

export async function verifyViaCdpFacilitator(args: {
  paymentPayload: unknown;
  paymentRequirements: CdpV2PaymentRequirements;
}): Promise<CdpVerifyResult> {
  if (!CDP_FACILITATOR_ENABLED) {
    return { isValid: false, error: 'CDP facilitator not configured' };
  }
  try {
    const { status, body, extensionResponses } = await cdpPost('verify', args.paymentPayload, args.paymentRequirements);
    if (!body) {
      return { isValid: false, error: `CDP verify returned no body (status ${status})` };
    }
    return {
      isValid: body.isValid === true,
      payer: asString(body.payer),
      invalidReason: asString(body.invalidReason),
      extensionResponses,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'CDP verify error';
    console.error('verifyViaCdpFacilitator error:', message);
    return { isValid: false, error: message };
  }
}

export async function settleViaCdpFacilitator(args: {
  paymentPayload: unknown;
  paymentRequirements: CdpV2PaymentRequirements;
}): Promise<CdpSettleResult> {
  if (!CDP_FACILITATOR_ENABLED) {
    return { success: false, error: 'CDP facilitator not configured' };
  }
  try {
    const { status, body, extensionResponses } = await cdpPost('settle', args.paymentPayload, args.paymentRequirements);
    if (!body) {
      return { success: false, error: `CDP settle returned no body (status ${status})` };
    }
    return {
      success: body.success === true,
      transaction: asString(body.transaction),
      network: asString(body.network),
      payer: asString(body.payer),
      errorReason: asString(body.errorReason),
      extensionResponses,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'CDP settle error';
    console.error('settleViaCdpFacilitator error:', message);
    return { success: false, error: message };
  }
}
