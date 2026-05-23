export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { rateLimit } from '@/lib/rateLimit';
import { authenticateUserRequestWithChain } from '@/lib/session';
import { WalletAuthError } from '@/lib/solana-auth';
import {
  getSubmittedSkillBySlug,
  hasSkillPurchase,
  insertSkillPurchase,
  getSkillPurchaseByTx,
} from '@/lib/atelier-db';
import { verifySolanaUsdcSentToWallet } from '@/lib/solana-verify';
import { verifyBaseUsdcSentToWallet } from '@/lib/base-verify';

const purchaseRateLimit = rateLimit(20, 60 * 60 * 1000);

function sigFieldsFromBody(body: Record<string, unknown>): Record<string, unknown> | null {
  const wallet = body.wallet;
  const wallet_sig = body.wallet_sig;
  const wallet_sig_ts = body.wallet_sig_ts;
  if (!wallet && !wallet_sig && !wallet_sig_ts) return null;
  return {
    wallet: typeof wallet === 'string' ? wallet : undefined,
    wallet_sig: typeof wallet_sig === 'string' ? wallet_sig : undefined,
    wallet_sig_ts: typeof wallet_sig_ts === 'number' ? wallet_sig_ts : undefined,
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = purchaseRateLimit(req);
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const pack = String(body.pack ?? '').trim();
  const slug = String(body.slug ?? '').trim();
  const chainRaw = String(body.chain ?? '').toLowerCase();
  const txHash = String(body.tx_hash ?? '').trim();

  if (pack !== 'community') {
    return NextResponse.json(
      { success: false, error: 'Only community skills support paid purchase' },
      { status: 400 },
    );
  }
  if (!slug) return NextResponse.json({ success: false, error: 'Missing slug' }, { status: 400 });
  if (chainRaw !== 'solana' && chainRaw !== 'base') {
    return NextResponse.json({ success: false, error: 'Invalid chain' }, { status: 400 });
  }
  if (!txHash) return NextResponse.json({ success: false, error: 'Missing tx_hash' }, { status: 400 });

  const chain = chainRaw as 'solana' | 'base';

  let buyerWallet: string;
  try {
    const auth = await authenticateUserRequestWithChain(req, sigFieldsFromBody(body));
    buyerWallet = auth.wallet;
  } catch (err) {
    if (err instanceof WalletAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 });
  }

  const skill = await getSubmittedSkillBySlug(slug);
  if (!skill || skill.status !== 'live') {
    return NextResponse.json({ success: false, error: 'Skill not found' }, { status: 404 });
  }
  if (skill.pricing !== 'paid' || skill.price_usdc <= 0) {
    return NextResponse.json({ success: false, error: 'Skill is not for sale' }, { status: 400 });
  }
  if (skill.creator_chain !== chain) {
    return NextResponse.json(
      {
        success: false,
        error: `This skill's creator is paid on ${skill.creator_chain}. Pay on that chain.`,
      },
      { status: 400 },
    );
  }

  // Reject double-spend / replay of an existing purchase tx
  const existingByTx = await getSkillPurchaseByTx(txHash);
  if (existingByTx) {
    if (existingByTx.buyer_wallet.toLowerCase() === buyerWallet.toLowerCase()) {
      return NextResponse.json({ success: true, data: { already: true } });
    }
    return NextResponse.json(
      { success: false, error: 'Transaction already recorded for another buyer' },
      { status: 409 },
    );
  }

  // Idempotency: buyer may already own the skill
  const owns = await hasSkillPurchase(pack, slug, buyerWallet);
  if (owns) {
    return NextResponse.json({ success: true, data: { already: true } });
  }

  // Verify on-chain
  const verify =
    chain === 'solana'
      ? await verifySolanaUsdcSentToWallet(
          txHash,
          buyerWallet,
          skill.creator_wallet,
          skill.price_usdc,
        )
      : await verifyBaseUsdcSentToWallet(
          txHash as `0x${string}`,
          buyerWallet,
          skill.creator_wallet,
          skill.price_usdc,
        );

  if (!verify.verified) {
    return NextResponse.json(
      { success: false, error: verify.error || 'Payment verification failed' },
      { status: 402 },
    );
  }

  try {
    await insertSkillPurchase({
      id: `spu_${Date.now()}_${randomBytes(4).toString('hex')}`,
      pack,
      slug,
      buyer_wallet: buyerWallet,
      creator_wallet: skill.creator_wallet,
      chain,
      amount_usd: skill.price_usdc,
      tx_hash: txHash,
    });
  } catch (err) {
    console.error('Skill purchase insert failed:', err);
    return NextResponse.json({ success: false, error: 'Database write failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: { pack, slug } });
}
