export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAtelierAgentsByWallet, getAtelierAgentsByPrivyUser, getAtelierAgentsByTwitterUsername, type AtelierAgent } from '@/lib/atelier-db';
import { requireWalletAuth, WalletAuthError } from '@/lib/solana-auth';
import { getPrivyServer } from '@/lib/privy-server';
import { rateLimiters } from '@/lib/rateLimit';

const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function formatAgentResponse(agent: AtelierAgent) {
  return {
    agent_id: agent.id,
    slug: agent.slug,
    name: agent.name,
    description: agent.description,
    api_key: agent.api_key,
    twitter_username: agent.twitter_username,
    verified: agent.verified,
    created_at: agent.created_at,
  };
}

async function recoverByWallet(body: Record<string, unknown>): Promise<NextResponse> {
  const { owner_wallet, wallet_sig, wallet_sig_ts, agent_name } = body;

  if (!owner_wallet || typeof owner_wallet !== 'string' || !BASE58_REGEX.test(owner_wallet)) {
    return NextResponse.json(
      { success: false, error: 'owner_wallet must be a valid base58 Solana address' },
      { status: 400 },
    );
  }

  if (!wallet_sig || !wallet_sig_ts) {
    return NextResponse.json(
      { success: false, error: 'wallet_sig and wallet_sig_ts are required for wallet recovery' },
      { status: 400 },
    );
  }

  try {
    requireWalletAuth({ wallet: owner_wallet, wallet_sig: String(wallet_sig), wallet_sig_ts: Number(wallet_sig_ts) });
  } catch (err) {
    const msg = err instanceof WalletAuthError ? err.message : 'Wallet verification failed';
    return NextResponse.json({ success: false, error: msg }, { status: 401 });
  }

  let agents = await getAtelierAgentsByWallet(owner_wallet);

  if (agent_name && typeof agent_name === 'string') {
    const normalized = agent_name.trim().toLowerCase();
    agents = agents.filter(a => a.name.trim().toLowerCase() === normalized);
  }

  if (agents.length === 0) {
    return NextResponse.json(
      { success: false, error: 'No agents found for this wallet' + (agent_name ? ` with name "${agent_name}"` : '') },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    data: { agents: agents.map(formatAgentResponse) },
  });
}

async function recoverByPrivy(accessToken: string, body: Record<string, unknown>): Promise<NextResponse> {
  const { agent_name } = body;

  let privy;
  try {
    privy = getPrivyServer();
  } catch {
    return NextResponse.json(
      { success: false, error: 'X login recovery is not configured on this server' },
      { status: 503 },
    );
  }

  let userId: string;
  try {
    const verified = await privy.utils().auth().verifyAccessToken(accessToken);
    userId = verified.user_id;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid or expired Privy token' }, { status: 401 });
  }

  let twitterUsername: string | null = null;
  try {
    const user = await privy.users()._get(userId);
    const twitterAccount = user.linked_accounts.find(
      (a): a is Extract<typeof a, { type: 'twitter_oauth' }> => a.type === 'twitter_oauth',
    );
    twitterUsername = twitterAccount?.username ?? null;
  } catch {
    // user lookup failed — proceed with privy_user_id only
  }

  const results = new Map<string, AtelierAgent>();

  const privyAgents = await getAtelierAgentsByPrivyUser(userId);
  for (const agent of privyAgents) results.set(agent.id, agent);

  if (twitterUsername) {
    const twitterAgents = await getAtelierAgentsByTwitterUsername(twitterUsername);
    for (const agent of twitterAgents) results.set(agent.id, agent);
  }

  let agents = Array.from(results.values());

  if (agent_name && typeof agent_name === 'string') {
    const normalized = agent_name.trim().toLowerCase();
    agents = agents.filter(a => a.name.trim().toLowerCase() === normalized);
  }

  if (agents.length === 0) {
    return NextResponse.json(
      { success: false, error: 'No agents found for this account' + (agent_name ? ` with name "${agent_name}"` : '') },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    data: { agents: agents.map(formatAgentResponse) },
  });
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = rateLimiters.verification(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const authHeader = request.headers.get('authorization');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;

    if (body.owner_wallet && body.wallet_sig) {
      return await recoverByWallet(body);
    }

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      if (!token.startsWith('atelier_')) {
        return await recoverByPrivy(token, body);
      }
    }

    return NextResponse.json({
      success: false,
      error: 'Authentication required. Use wallet signature (owner_wallet + wallet_sig + wallet_sig_ts) or Privy Bearer token (X login).',
    }, { status: 400 });
  } catch (error) {
    console.error('POST /api/agents/recover error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
