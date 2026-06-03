export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { randomBytes } from 'crypto';
import { rateLimit } from '@/lib/rateLimit';
import { authenticateUserRequest } from '@/lib/session';
import { WalletAuthError } from '@/lib/solana-auth';
import { insertSubmittedSkill, getSubmittedSkillBySlug, setSkillModeration } from '@/lib/atelier-db';
import { moderateListing } from '@/lib/pod';
import { readPrivyAccessToken, verifyPrivyAccessToken } from '@/lib/privy-auth';
import { SKILL_CATEGORIES } from '@/components/atelier/market/marketData';

const submitRateLimit = rateLimit(10, 60 * 60 * 1000);

const MAX_MD_BYTES = 256 * 1024;
const MAX_NAME = 60;
const MAX_DESCRIPTION = 1000;
const MAX_PRICE_USDC = 10_000;
const VALID_CATEGORY_SLUGS = new Set(SKILL_CATEGORIES.map((c) => c.slug));

function sigFieldsFromForm(form: FormData): Record<string, unknown> | null {
  const wallet = form.get('wallet');
  const wallet_sig = form.get('wallet_sig');
  const wallet_sig_ts = form.get('wallet_sig_ts');
  if (!wallet && !wallet_sig && !wallet_sig_ts) return null;
  return {
    wallet: typeof wallet === 'string' ? wallet : undefined,
    wallet_sig: typeof wallet_sig === 'string' ? wallet_sig : undefined,
    wallet_sig_ts: typeof wallet_sig_ts === 'string' ? Number(wallet_sig_ts) : undefined,
  };
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function uniqueSlug(base: string): Promise<string> {
  const root = base || 'skill';
  let candidate = root;
  for (let i = 0; i < 5; i++) {
    const existing = await getSubmittedSkillBySlug(candidate);
    if (!existing) return candidate;
    candidate = `${root}-${randomBytes(2).toString('hex')}`;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = submitRateLimit(req);
  if (limited) return limited;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid multipart payload' }, { status: 400 });
  }

  let userId: string | null = null;
  let wallet: string;

  const privyToken = readPrivyAccessToken(req, null);
  if (privyToken) {
    try {
      const info = await verifyPrivyAccessToken(privyToken);
      userId = info.privyUserId;
    } catch {
      // fall through to wallet auth
    }
  }

  if (userId) {
    // creator_wallet is the payout destination the creator wants to be paid on.
    const w = form.get('wallet');
    wallet = typeof w === 'string' ? w.trim() : '';
    if (!wallet) {
      return NextResponse.json({ success: false, error: 'Missing payout wallet' }, { status: 400 });
    }
  } else {
    try {
      wallet = await authenticateUserRequest(req, sigFieldsFromForm(form));
    } catch (err) {
      if (err instanceof WalletAuthError) {
        return NextResponse.json({ success: false, error: err.message }, { status: 401 });
      }
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 });
    }
  }

  const file = form.get('file');
  const name = String(form.get('name') ?? '').trim();
  const description = String(form.get('description') ?? '').trim();
  const category = String(form.get('category') ?? '').trim();
  const pricing = String(form.get('pricing') ?? 'free').trim();
  const priceRaw = String(form.get('price_usdc') ?? '0').trim();
  const creatorChainRaw = String(form.get('creator_chain') ?? '').trim().toLowerCase();
  const creator_chain: 'solana' | 'base' =
    creatorChainRaw === 'base' ? 'base' : 'solana';

  if (!name) return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
  if (name.length > MAX_NAME) return NextResponse.json({ success: false, error: `Name must be at most ${MAX_NAME} chars` }, { status: 400 });
  if (!description) return NextResponse.json({ success: false, error: 'Description is required' }, { status: 400 });
  if (description.length > MAX_DESCRIPTION) return NextResponse.json({ success: false, error: `Description must be at most ${MAX_DESCRIPTION} chars` }, { status: 400 });
  if (!VALID_CATEGORY_SLUGS.has(category)) return NextResponse.json({ success: false, error: 'Unknown category' }, { status: 400 });
  if (pricing !== 'free' && pricing !== 'paid') return NextResponse.json({ success: false, error: 'Invalid pricing' }, { status: 400 });

  let price_usdc = 0;
  if (pricing === 'paid') {
    price_usdc = Number(priceRaw);
    if (!Number.isFinite(price_usdc) || price_usdc <= 0 || price_usdc > MAX_PRICE_USDC) {
      return NextResponse.json({ success: false, error: 'Invalid price' }, { status: 400 });
    }
  }

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ success: false, error: 'A .md file is required' }, { status: 400 });
  }

  const filename = file instanceof File ? file.name : 'skill.md';
  if (!filename.toLowerCase().endsWith('.md')) {
    return NextResponse.json({ success: false, error: 'Only .md files are accepted' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ success: false, error: 'File is empty' }, { status: 400 });
  }
  if (file.size > MAX_MD_BYTES) {
    return NextResponse.json({ success: false, error: `File too large (max ${MAX_MD_BYTES / 1024} KB)` }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const head = buffer.subarray(0, 4).toString('hex');
  if (head === '25504446' || head === '504b0304' || head === '7f454c46' || head === '89504e47') {
    return NextResponse.json({ success: false, error: 'File contents are not Markdown' }, { status: 400 });
  }

  const slugBase = slugify(name);
  const slug = await uniqueSlug(slugBase);
  const id = `csk_${Date.now()}_${randomBytes(4).toString('hex')}`;
  const blobPath = `atelier-skills/${slug}-${randomBytes(3).toString('hex')}.md`;

  let blobUrl: string;
  try {
    const blob = await put(blobPath, buffer, {
      access: 'public',
      contentType: 'text/markdown; charset=utf-8',
    });
    blobUrl = blob.url;
  } catch (err) {
    console.error('Skill blob upload failed:', err);
    return NextResponse.json({ success: false, error: 'Upload failed' }, { status: 500 });
  }

  try {
    await insertSubmittedSkill({
      id,
      slug,
      creator_wallet: wallet,
      creator_chain,
      user_id: userId,
      name,
      description,
      category,
      file_url: blobUrl,
      file_size: buffer.length,
      pricing: pricing as 'free' | 'paid',
      price_usdc,
    });
  } catch (err) {
    console.error('Skill insert failed:', err);
    return NextResponse.json({ success: false, error: 'Database write failed' }, { status: 500 });
  }

  moderateListing('skill', `${name}\n${description}`)
    .then((m) => (m.verdict === 'ok' ? undefined : setSkillModeration(id, m.verdict, m.reason)))
    .catch((err) => console.error(`Skill moderation failed for ${id}:`, err));

  return NextResponse.json({
    success: true,
    data: {
      id,
      slug,
      pack: 'community',
      url: `/skills/community/${slug}`,
    },
  });
}
