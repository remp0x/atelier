export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { registerAtelierAgent, DuplicateAgentError, isRegistrationTxUsed, setAgentModeration, setAgentServerWallets, isBannedIdentity, type ServiceCategory } from '@/lib/atelier-db';
import { provisionServerWallets } from '@/lib/privy-server-wallets';
import { moderateListing } from '@/lib/pod';
import { rateLimiters, getClientIp, isBlockedIp } from '@/lib/rateLimit';
import { validateExternalUrl } from '@/lib/url-validation';
import { violatesReservedBrand } from '@/lib/content-guard';
import { readPrivyAccessToken, verifyPrivyAccessToken, PrivyAuthError } from '@/lib/privy-auth';
import { authenticateUserRequest } from '@/lib/session';
import { WalletAuthError } from '@/lib/solana-auth';
import {
  parseX402Header,
  networkToChain,
  verifyX402Payment,
  buildFlatPaymentRequirements,
  buildPaymentRequiredResponse,
  type PaymentChain,
} from '@/lib/x402';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://useatelier.ai';

const VALID_CAPABILITIES: ServiceCategory[] = ['image_gen', 'video_gen', 'ugc', 'influencer', 'brand_content', 'coding', 'analytics', 'seo', 'trading', 'automation', 'consulting', 'custom'];
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const REGISTRATION_FEE_USD = Number(process.env.ATELIER_REGISTRATION_FEE_USD || '1');

const PROTOCOL_SPEC = {
  required_endpoints: [
    'GET  /agent/profile    -> { name, description, avatar_url, capabilities[] }',
    'GET  /agent/services   -> { services: [{ id, title, description, price_usd, category }] }',
    'POST /agent/execute    -> { service_id, brief, params } -> { result, deliverable_url }',
    'GET  /agent/portfolio  -> { works: [{ url, type, caption, created_at }] }',
  ],
};

function kickoffModeration(agentId: string, fields: CommonFields): void {
  moderateListing('agent', `${fields.name}\n${fields.description}`)
    .then((m) => (m.verdict === 'ok' ? undefined : setAgentModeration(agentId, m.verdict, m.reason)))
    .catch((err) => console.error(`Agent moderation failed for ${agentId}:`, err));
}

type CommonFields = {
  name: string;
  description: string;
  avatar_url?: string;
  endpoint_url?: string;
  capabilities: ServiceCategory[];
  ai_models?: string[];
};

function parseCommonFields(body: Record<string, unknown>): { error: NextResponse } | { fields: CommonFields } {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 2 || name.length > 50) {
    return { error: NextResponse.json({ success: false, error: 'name is required (2-50 characters)' }, { status: 400 }) };
  }
  if (violatesReservedBrand(name)) {
    return { error: NextResponse.json({ success: false, error: 'That name is reserved and cannot be used.' }, { status: 400 }) };
  }

  const description = typeof body.description === 'string' ? body.description : '';
  if (description.length < 10 || description.length > 500) {
    return { error: NextResponse.json({ success: false, error: 'description is required (10-500 characters)' }, { status: 400 }) };
  }

  const endpoint_url = typeof body.endpoint_url === 'string' ? body.endpoint_url : undefined;
  if (endpoint_url) {
    const check = validateExternalUrl(endpoint_url);
    if (!check.valid) {
      return { error: NextResponse.json({ success: false, error: `Invalid endpoint_url: ${check.error}` }, { status: 400 }) };
    }
  }

  const capabilities = Array.isArray(body.capabilities) ? (body.capabilities as string[]) : [];
  const invalid = capabilities.filter((c) => !VALID_CAPABILITIES.includes(c as ServiceCategory));
  if (invalid.length > 0) {
    return { error: NextResponse.json({ success: false, error: `Invalid capabilities: ${invalid.join(', ')}` }, { status: 400 }) };
  }

  const avatar_url = typeof body.avatar_url === 'string' ? body.avatar_url : undefined;
  const ai_models = Array.isArray(body.ai_models) ? (body.ai_models as string[]) : undefined;

  return { fields: { name, description, avatar_url, endpoint_url, capabilities: capabilities as ServiceCategory[], ai_models } };
}

async function registrationResponse(
  result: { agent_id: string; slug: string; api_key: string; webhook_secret: string | null },
  opts: { twitter_username: string | null; marketable: boolean; note?: string },
): Promise<NextResponse> {
  // Every agent gets its server wallet up front: it pays the agent's own on-chain
  // costs (token launch, SAID identity) and receives the token creator-fee share.
  // Best-effort -- registration never fails on a provisioning hiccup.
  let solanaWalletAddress: string | null = null;
  try {
    const provisioned = await provisionServerWallets(result.agent_id);
    if (provisioned.evm || provisioned.solana) {
      await setAgentServerWallets(result.agent_id, {
        evmWalletId: provisioned.evm?.id,
        evmAddress: provisioned.evm?.address,
        solanaWalletId: provisioned.solana?.id,
        solanaAddress: provisioned.solana?.address,
      });
    }
    solanaWalletAddress = provisioned.solana?.address ?? null;
  } catch (err) {
    console.error('[register] server wallet provisioning failed:', err instanceof Error ? err.message : err);
  }

  return NextResponse.json({
    success: true,
    data: {
      agent_id: result.agent_id,
      slug: result.slug,
      api_key: result.api_key,
      webhook_secret: result.webhook_secret,
      twitter_username: opts.twitter_username,
      marketable: opts.marketable,
      ...(opts.note ? { note: opts.note } : {}),
      ...(solanaWalletAddress ? {
        wallet: {
          solana_address: solanaWalletAddress,
          note: 'Your agent pays its own on-chain costs (token launch, SAID identity) from this wallet and receives 65% of its token creator fees here. Fund it with SOL on Solana mainnet; live amounts at GET /api/agents/{agent_id}/funding.',
        },
      } : {}),
      protocol_spec: PROTOCOL_SPEC,
    },
  }, { status: 201 });
}

function bannedResponse(): NextResponse {
  return NextResponse.json(
    { success: false, error: 'This account is banned from Atelier.' },
    { status: 403 },
  );
}

async function registerViaPrivy(body: Record<string, unknown>, token: string, clientIp: string): Promise<NextResponse> {
  let privyUserId: string;
  let twitterUsername: string | null;
  let email: string | null;
  try {
    const privyUser = await verifyPrivyAccessToken(token);
    privyUserId = privyUser.privyUserId;
    twitterUsername = privyUser.twitterUsername;
    email = privyUser.email ?? privyUser.googleEmail;
  } catch (e) {
    const status = e instanceof PrivyAuthError ? e.statusCode : 401;
    const message = e instanceof Error ? e.message : 'Authentication required';
    return NextResponse.json({ success: false, error: message }, { status });
  }

  if (await isBannedIdentity({ privyUserId, twitter: twitterUsername, email })) {
    return bannedResponse();
  }

  const parsed = parseCommonFields(body);
  if ('error' in parsed) return parsed.error;

  const result = await registerAtelierAgent({
    ...parsed.fields,
    user_id: privyUserId,
    privy_user_id: privyUserId,
    twitter_username: twitterUsername ?? undefined,
    registration_ip: clientIp,
  });

  kickoffModeration(result.agent_id, parsed.fields);
  return registrationResponse(result, { twitter_username: twitterUsername, marketable: true });
}

async function registerViaWallet(request: NextRequest, body: Record<string, unknown>, clientIp: string): Promise<NextResponse> {
  const owner_wallet = typeof body.owner_wallet === 'string' ? body.owner_wallet : '';
  if (!BASE58_REGEX.test(owner_wallet)) {
    return NextResponse.json({ success: false, error: 'owner_wallet must be a valid base58 Solana address' }, { status: 400 });
  }

  let verifiedWallet: string;
  try {
    verifiedWallet = await authenticateUserRequest(request, body, owner_wallet);
  } catch (e) {
    const message = e instanceof WalletAuthError ? e.message : 'Wallet authentication failed';
    return NextResponse.json({ success: false, error: message }, { status: 401 });
  }

  if (await isBannedIdentity({ wallet: verifiedWallet })) return bannedResponse();

  const parsed = parseCommonFields(body);
  if ('error' in parsed) return parsed.error;

  const result = await registerAtelierAgent({ ...parsed.fields, owner_wallet: verifiedWallet, registration_ip: clientIp });
  kickoffModeration(result.agent_id, parsed.fields);
  return registrationResponse(result, { twitter_username: null, marketable: true });
}

function registration402Challenge(chain: PaymentChain): Response {
  const requirements = buildFlatPaymentRequirements({
    amountUsd: REGISTRATION_FEE_USD,
    description: 'Atelier agent registration',
    resource: `${BASE_URL}/api/agents/register`,
    chain,
  });
  return buildPaymentRequiredResponse(requirements);
}

async function registerViaX402(body: Record<string, unknown>, txRef: string, chainHint: PaymentChain | null, clientIp: string): Promise<NextResponse> {
  if (await isRegistrationTxUsed(txRef)) {
    return NextResponse.json({ success: false, error: 'This payment was already used to register an agent' }, { status: 409 });
  }

  const verification = await verifyX402Payment(txRef, REGISTRATION_FEE_USD, chainHint);
  if (!verification.verified || !verification.payerWallet) {
    return NextResponse.json({ success: false, error: `Payment verification failed: ${verification.error ?? 'unknown error'}` }, { status: 402 });
  }

  if (await isBannedIdentity({ wallet: verification.payerWallet })) return bannedResponse();

  const parsed = parseCommonFields(body);
  if ('error' in parsed) return parsed.error;

  const result = await registerAtelierAgent({
    ...parsed.fields,
    owner_wallet: verification.payerWallet,
    registration_tx: txRef,
    registration_ip: clientIp,
  });
  kickoffModeration(result.agent_id, parsed.fields);
  return registrationResponse(result, { twitter_username: null, marketable: true });
}

async function registerBare(body: Record<string, unknown>, clientIp: string): Promise<NextResponse> {
  const parsed = parseCommonFields(body);
  if ('error' in parsed) return parsed.error;

  const result = await registerAtelierAgent({ ...parsed.fields, registration_ip: clientIp });
  kickoffModeration(result.agent_id, parsed.fields);
  return registrationResponse(result, {
    twitter_username: null,
    marketable: false,
    note: 'Agent registered but hidden from the marketplace. Attach an owner (pay via x402, sign with a wallet, or sign in on the website) to become discoverable and hireable.',
  });
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = rateLimiters.registration(request);
  if (rateLimitResponse) return rateLimitResponse;

  const clientIp = getClientIp(request);
  if (isBlockedIp(clientIp)) {
    return NextResponse.json(
      { success: false, error: 'Registration is not available from this network.' },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();

    const regTx = parseX402Header(request.headers.get('X-PAYMENT'));
    const regNet = networkToChain(request.headers.get('X-Payment-Network'));
    if (regTx) {
      return await registerViaX402(body, regTx, regNet, clientIp);
    }

    const wantsPay = regNet !== null
      || request.nextUrl.searchParams.get('pay') === 'x402'
      || body.pay_to_register === true;
    if (wantsPay) {
      return registration402Challenge(regNet ?? 'solana');
    }

    const privyToken = readPrivyAccessToken(request, body);
    if (privyToken) {
      return await registerViaPrivy(body, privyToken, clientIp);
    }

    if (typeof body.owner_wallet === 'string' && (body.wallet_sig || body.wallet_sig_ts)) {
      return await registerViaWallet(request, body, clientIp);
    }

    return await registerBare(body, clientIp);
  } catch (error) {
    if (error instanceof DuplicateAgentError) {
      const existing = error.existingAgent;
      const maskedKey = existing.api_key
        ? `atelier_...${existing.api_key.slice(-4)}`
        : null;
      return NextResponse.json({
        success: false,
        error: 'duplicate_agent',
        message: `An agent named "${existing.name}" was registered recently. If this is yours, recover it instead of re-registering.`,
        existing_agent: {
          agent_id: existing.id,
          slug: existing.slug,
          name: existing.name,
          created_at: existing.created_at,
          api_key_hint: maskedKey,
        },
        recovery: 'POST /api/agents/recover with wallet signature or social login to retrieve your API key.',
      }, { status: 409 });
    }

    console.error('Atelier agent registration error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
