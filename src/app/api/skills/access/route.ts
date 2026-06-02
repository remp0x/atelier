export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { authenticateUserRequestWithChain } from '@/lib/session';
import { WalletAuthError } from '@/lib/solana-auth';
import { getSubmittedSkillBySlug, hasSkillPurchase, hasSkillPurchaseByUser } from '@/lib/atelier-db';
import { readPrivyAccessToken, verifyPrivyAccessToken } from '@/lib/privy-auth';

const accessRateLimit = rateLimit(120, 60 * 1000);

function sigFieldsFromQuery(req: NextRequest): Record<string, unknown> | null {
  const url = new URL(req.url);
  const wallet = url.searchParams.get('wallet') ?? undefined;
  const wallet_sig = url.searchParams.get('wallet_sig') ?? undefined;
  const wallet_sig_ts = url.searchParams.get('wallet_sig_ts');
  if (!wallet && !wallet_sig && !wallet_sig_ts) return null;
  return {
    wallet,
    wallet_sig,
    wallet_sig_ts: wallet_sig_ts ? Number(wallet_sig_ts) : undefined,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const limited = accessRateLimit(req);
  if (limited) return limited;

  const url = new URL(req.url);
  const pack = url.searchParams.get('pack') ?? '';
  const slug = url.searchParams.get('slug') ?? '';

  if (pack !== 'community') {
    return NextResponse.json(
      { success: false, error: 'Access checks only apply to community skills' },
      { status: 400 },
    );
  }
  if (!slug) return NextResponse.json({ success: false, error: 'Missing slug' }, { status: 400 });

  let userId: string | null = null;
  let wallet: string | null = null;

  const privyToken = readPrivyAccessToken(req, null);
  if (privyToken) {
    try {
      const info = await verifyPrivyAccessToken(privyToken);
      userId = info.privyUserId;
    } catch {
      // fall through to wallet auth
    }
  }

  if (!userId) {
    try {
      const auth = await authenticateUserRequestWithChain(req, sigFieldsFromQuery(req));
      wallet = auth.wallet;
    } catch (err) {
      if (err instanceof WalletAuthError) {
        return NextResponse.json({ success: false, error: err.message }, { status: 401 });
      }
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 });
    }
  }

  const skill = await getSubmittedSkillBySlug(slug);
  if (!skill || skill.status !== 'live') {
    return NextResponse.json({ success: false, error: 'Skill not found' }, { status: 404 });
  }

  if (skill.pricing === 'free') {
    return NextResponse.json({
      success: true,
      data: { purchased: true, download_url: skill.file_url },
    });
  }

  const owns = userId
    ? await hasSkillPurchaseByUser(pack, slug, userId)
    : await hasSkillPurchase(pack, slug, wallet as string);
  return NextResponse.json({
    success: true,
    data: {
      purchased: owns,
      download_url: owns ? skill.file_url : null,
    },
  });
}
