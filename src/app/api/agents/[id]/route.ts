export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getAtelierAgent,
  resolveAgent,
  updateAtelierAgent,
  getServicesByAgent,
  getServiceReviews,
  getRecentOrdersForAgent,
  getAgentPortfolio,
  getAgentOrderCounts,
  getPendingOrderCountForAgent,
  type ServiceCategory,
} from '@/lib/atelier-db';
import { WalletAuthError } from '@/lib/solana-auth';
import { authenticateUserRequest } from '@/lib/session';
import { resolveExternalAgentByApiKey, AuthError } from '@/lib/atelier-auth';
import { validateExternalUrl } from '@/lib/url-validation';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const agent = await resolveAgent(id);

    if (!agent) {
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 }
      );
    }

    const url = new URL(_request.url);
    const viewerWallet = url.searchParams.get('wallet');
    const isOwner = viewerWallet && agent.owner_wallet === viewerWallet;

    if (agent.source === 'external') {
      let capabilities: string[] = [];
      try { capabilities = JSON.parse(agent.capabilities); } catch { /* empty */ }

      const [services, recentOrders, portfolio, orderCounts] = await Promise.all([
        getServicesByAgent(agent.id),
        getRecentOrdersForAgent(agent.id, 10),
        getAgentPortfolio(agent.id, 20),
        getAgentOrderCounts(agent.id),
      ]);

      const allReviews = await Promise.all(
        services.map((s) => getServiceReviews(s.id))
      );

      const agentPayload: Record<string, unknown> = {
        id: agent.id,
        slug: agent.slug,
        name: agent.name,
        description: agent.description,
        avatar_url: agent.avatar_url,
        source: 'external' as const,
        verified: agent.verified,
        blue_check: agent.blue_check || 0,
        atelier_holder: agent.atelier_holder || 0,
        partner_badge: agent.partner_badge || null,
        twitter_username: agent.twitter_username,
        has_endpoint: !!agent.endpoint_url,
        capabilities,
        ai_models: agent.ai_models ? JSON.parse(agent.ai_models) : [],
        owner_wallet: agent.owner_wallet || null,
        token: {
          mint: agent.token_mint,
          name: agent.token_name,
          symbol: agent.token_symbol,
          image_url: agent.token_image_url,
          mode: agent.token_mode,
          creator_wallet: agent.token_creator_wallet,
          tx_hash: agent.token_tx_hash,
          launch_attempted: !!agent.token_launch_attempted,
        },
      };

      if (isOwner) {
        const pendingOrders = await getPendingOrderCountForAgent(agent.id);
        agentPayload.last_poll_at = agent.last_poll_at || null;
        agentPayload.pending_orders = pendingOrders;
      }

      return NextResponse.json({
        success: true,
        data: {
          agent: agentPayload,
          services,
          portfolio,
          stats: {
            completed_orders: orderCounts.total,
            avg_rating: agent.avg_rating,
            followers: 0,
            services_count: services.length,
          },
          reviews: allReviews.flat(),
          recentOrders,
        },
      });
    }

    const [services, recentOrders, portfolio, orderCounts] = await Promise.all([
      getServicesByAgent(agent.id),
      getRecentOrdersForAgent(agent.id, 10),
      getAgentPortfolio(agent.id, 20),
      getAgentOrderCounts(agent.id),
    ]);

    const allReviews = await Promise.all(
      services.map((s) => getServiceReviews(s.id))
    );
    const reviews = allReviews.flat();

    const ratings = services.filter((s) => s.avg_rating != null).map((s) => s.avg_rating as number);
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

    const atelierAgentPayload: Record<string, unknown> = {
      id: agent.id,
      slug: agent.slug,
      name: agent.name,
      description: agent.description,
      bio: agent.bio,
      avatar_url: agent.avatar_url,
      source: agent.source,
      verified: agent.verified,
      blue_check: agent.blue_check,
      atelier_holder: agent.atelier_holder || 0,
      is_atelier_official: agent.is_atelier_official || 0,
      partner_badge: agent.partner_badge || null,
      twitter_username: agent.twitter_username,
      ai_models: agent.ai_models ? JSON.parse(agent.ai_models) : [],
      owner_wallet: agent.owner_wallet || null,
      token: {
        mint: agent.token_mint,
        name: agent.token_name,
        symbol: agent.token_symbol,
        image_url: agent.token_image_url,
        mode: agent.token_mode,
        creator_wallet: agent.token_creator_wallet,
        tx_hash: agent.token_tx_hash,
        launch_attempted: !!agent.token_launch_attempted,
      },
    };

    if (isOwner) {
      const pendingOrders = await getPendingOrderCountForAgent(agent.id);
      atelierAgentPayload.last_poll_at = agent.last_poll_at || null;
      atelierAgentPayload.pending_orders = pendingOrders;
    }

    return NextResponse.json({
      success: true,
      data: {
        agent: atelierAgentPayload,
        services,
        portfolio,
        stats: {
          completed_orders: orderCounts.total,
          avg_rating: avgRating,
          followers: 0,
          services_count: services.length,
        },
        reviews,
        recentOrders,
      },
    });
  } catch (error) {
    console.error('Atelier agent detail error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

const VALID_CAPABILITIES: ServiceCategory[] = ['image_gen', 'video_gen', 'ugc', 'influencer', 'brand_content', 'coding', 'analytics', 'seo', 'trading', 'automation', 'consulting', 'custom'];
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();

    const agent = await getAtelierAgent(id);
    if (!agent) {
      return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 });
    }

    const hasApiKeyAuth = request.headers.get('authorization')?.startsWith('Bearer ');

    if (hasApiKeyAuth) {
      try {
        const authedAgent = await resolveExternalAgentByApiKey(request);
        if (authedAgent.id !== id) {
          return NextResponse.json({ success: false, error: 'API key does not match this agent' }, { status: 403 });
        }
      } catch (e) {
        if (e instanceof AuthError) {
          return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
        }
        throw e;
      }
    } else {
      let authedWallet: string;
      try {
        authedWallet = await authenticateUserRequest(request, body);
      } catch (e) {
        if (e instanceof WalletAuthError) {
          return NextResponse.json({ success: false, error: e.message }, { status: 401 });
        }
        throw e;
      }
      if (agent.owner_wallet !== authedWallet) {
        return NextResponse.json({ success: false, error: 'Not authorized to edit this agent' }, { status: 403 });
      }
    }

    const { name, description, avatar_url, endpoint_url, capabilities, payout_wallet, ai_models } = body;

    if (name !== undefined) {
      if (typeof name !== 'string' || name.length < 2 || name.length > 50) {
        return NextResponse.json({ success: false, error: 'Name must be between 2 and 50 characters' }, { status: 400 });
      }
    }

    if (description !== undefined) {
      if (typeof description !== 'string' || description.length < 10 || description.length > 500) {
        return NextResponse.json({ success: false, error: 'Description must be between 10 and 500 characters' }, { status: 400 });
      }
    }

    if (avatar_url !== undefined && avatar_url !== null) {
      const avatarCheck = validateExternalUrl(avatar_url);
      if (!avatarCheck.valid) {
        return NextResponse.json({ success: false, error: `Invalid avatar_url: ${avatarCheck.error}` }, { status: 400 });
      }
    }

    if (endpoint_url !== undefined) {
      const endpointCheck = validateExternalUrl(endpoint_url);
      if (!endpointCheck.valid) {
        return NextResponse.json({ success: false, error: `Invalid endpoint_url: ${endpointCheck.error}` }, { status: 400 });
      }
    }

    if (capabilities !== undefined) {
      if (!Array.isArray(capabilities)) {
        return NextResponse.json({ success: false, error: 'capabilities must be an array' }, { status: 400 });
      }
      const invalid = capabilities.filter((c: string) => !VALID_CAPABILITIES.includes(c as ServiceCategory));
      if (invalid.length > 0) {
        return NextResponse.json(
          { success: false, error: `Invalid capabilities: ${invalid.join(', ')}. Valid: ${VALID_CAPABILITIES.join(', ')}` },
          { status: 400 },
        );
      }
    }

    if (payout_wallet !== undefined && payout_wallet !== null) {
      if (typeof payout_wallet !== 'string' || !BASE58_REGEX.test(payout_wallet)) {
        return NextResponse.json(
          { success: false, error: 'payout_wallet must be a valid base58 Solana address' },
          { status: 400 },
        );
      }
    }

    if (ai_models !== undefined) {
      if (!Array.isArray(ai_models)) {
        return NextResponse.json({ success: false, error: 'ai_models must be an array of strings' }, { status: 400 });
      }
      if (ai_models.length > 10) {
        return NextResponse.json({ success: false, error: 'ai_models can have at most 10 items' }, { status: 400 });
      }
      const invalid = ai_models.find((m: unknown) => typeof m !== 'string' || m.length === 0 || m.length > 30);
      if (invalid !== undefined) {
        return NextResponse.json({ success: false, error: 'Each ai_model must be a non-empty string up to 30 characters' }, { status: 400 });
      }
    }

    const updates: Record<string, string | null> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;
    if (endpoint_url !== undefined) updates.endpoint_url = endpoint_url;
    if (capabilities !== undefined) updates.capabilities = JSON.stringify(capabilities);
    if (ai_models !== undefined) updates.ai_models = ai_models.length > 0 ? JSON.stringify(ai_models) : null;
    if (payout_wallet !== undefined) updates.payout_wallet = payout_wallet;

    const updated = await updateAtelierAgent(id, updates);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('PATCH /api/agents/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
