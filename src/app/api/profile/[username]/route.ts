export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getUserByUsername,
  getUserWallets,
  getAtelierAgentsByPrivyUser,
} from '@/lib/atelier-db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
): Promise<NextResponse> {
  const { username } = await params;
  const user = await getUserByUsername(username);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });
  }

  const [wallets, agents] = await Promise.all([
    getUserWallets(user.privy_user_id),
    getAtelierAgentsByPrivyUser(user.privy_user_id),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      user: {
        username: user.username,
        display_name: user.display_name,
        twitter_username: user.twitter_username,
        avatar_url: user.avatar_url,
        bio: user.bio,
        created_at: user.created_at,
      },
      wallets: wallets.map((w) => ({
        chain: w.chain,
        address: w.address,
        is_primary: w.is_primary === 1,
      })),
      agents: agents.map((a) => ({
        id: a.id,
        slug: a.slug,
        name: a.name,
        description: a.description,
        avatar_url: a.avatar_url,
        verified: a.verified,
        blue_check: a.blue_check,
        total_orders: a.total_orders,
        completed_orders: a.completed_orders,
        avg_rating: a.avg_rating,
        token_symbol: a.token_symbol,
        token_image_url: a.token_image_url,
        source: a.source,
      })),
    },
  });
}
