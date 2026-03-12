export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  createBounty, listBounties,
  VALID_BOUNTY_CATEGORIES, VALID_DEADLINE_HOURS, VALID_CLAIM_WINDOWS,
} from '@/lib/atelier-db';
import type { ServiceCategory } from '@/lib/atelier-db';
import { requireWalletAuth, WalletAuthError } from '@/lib/solana-auth';
import { rateLimiters } from '@/lib/rateLimit';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = rateLimiters.orders(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const { title, brief, category, budget_usd, deadline_hours, claim_window_hours, reference_urls, reference_images, client_wallet } = body;

    if (!title || !brief || !category || !budget_usd || !deadline_hours || !client_wallet) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: title, brief, category, budget_usd, deadline_hours, client_wallet' },
        { status: 400 },
      );
    }

    let verifiedWallet: string;
    try {
      verifiedWallet = requireWalletAuth({
        wallet: client_wallet,
        wallet_sig: body.wallet_sig,
        wallet_sig_ts: body.wallet_sig_ts,
      });
    } catch (err) {
      const msg = err instanceof WalletAuthError ? err.message : 'Authentication failed';
      return NextResponse.json({ success: false, error: msg }, { status: 401 });
    }

    if (verifiedWallet !== client_wallet) {
      return NextResponse.json(
        { success: false, error: 'Authenticated wallet does not match client_wallet' },
        { status: 403 },
      );
    }

    if (typeof title !== 'string' || title.length < 3 || title.length > 100) {
      return NextResponse.json({ success: false, error: 'Title must be 3-100 characters' }, { status: 400 });
    }

    if (typeof brief !== 'string' || brief.length < 10 || brief.length > 2000) {
      return NextResponse.json({ success: false, error: 'Brief must be 10-2000 characters' }, { status: 400 });
    }

    if (!VALID_BOUNTY_CATEGORIES.includes(category)) {
      return NextResponse.json({ success: false, error: `Invalid category. Must be one of: ${VALID_BOUNTY_CATEGORIES.join(', ')}` }, { status: 400 });
    }

    const budgetNum = parseFloat(budget_usd);
    if (isNaN(budgetNum) || budgetNum < 1) {
      return NextResponse.json({ success: false, error: 'budget_usd must be at least 1.00' }, { status: 400 });
    }

    if (!VALID_DEADLINE_HOURS.includes(deadline_hours)) {
      return NextResponse.json({ success: false, error: `deadline_hours must be one of: ${VALID_DEADLINE_HOURS.join(', ')}` }, { status: 400 });
    }

    if (claim_window_hours && !VALID_CLAIM_WINDOWS.includes(claim_window_hours)) {
      return NextResponse.json({ success: false, error: `claim_window_hours must be one of: ${VALID_CLAIM_WINDOWS.join(', ')}` }, { status: 400 });
    }

    if (reference_urls) {
      if (!Array.isArray(reference_urls) || reference_urls.length > 5) {
        return NextResponse.json({ success: false, error: 'reference_urls must be an array of max 5 URLs' }, { status: 400 });
      }
      for (const url of reference_urls) {
        try {
          const parsed = new URL(url);
          if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            return NextResponse.json({ success: false, error: `Invalid reference URL scheme: ${url}` }, { status: 400 });
          }
        } catch {
          return NextResponse.json({ success: false, error: `Invalid reference URL: ${url}` }, { status: 400 });
        }
      }
    }

    if (reference_images) {
      if (!Array.isArray(reference_images) || reference_images.length > 3) {
        return NextResponse.json({ success: false, error: 'reference_images must be an array of max 3 URLs' }, { status: 400 });
      }
      for (const url of reference_images) {
        if (typeof url !== 'string' || !url.includes('.vercel-storage.com')) {
          return NextResponse.json({ success: false, error: 'reference_images must contain valid Vercel Blob URLs' }, { status: 400 });
        }
      }
    }

    const bounty = await createBounty({
      poster_wallet: client_wallet,
      title,
      brief,
      category: category as ServiceCategory,
      budget_usd: budgetNum.toFixed(2),
      deadline_hours,
      claim_window_hours: claim_window_hours || 24,
      reference_urls: reference_urls || undefined,
      reference_images: reference_images || undefined,
    });

    return NextResponse.json({ success: true, data: bounty }, { status: 201 });
  } catch (error) {
    console.error('Error creating bounty:', error);
    return NextResponse.json({ success: false, error: 'Failed to create bounty' }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const params = request.nextUrl.searchParams;
    const result = await listBounties({
      status: params.get('status') || undefined,
      category: (params.get('category') as ServiceCategory) || undefined,
      min_budget: params.get('min_budget') || undefined,
      max_budget: params.get('max_budget') || undefined,
      sort: params.get('sort') || undefined,
      limit: params.get('limit') ? parseInt(params.get('limit')!) : undefined,
      offset: params.get('offset') ? parseInt(params.get('offset')!) : undefined,
    });

    return NextResponse.json({ success: true, data: result.data, total: result.total });
  } catch (error) {
    console.error('Error listing bounties:', error);
    return NextResponse.json({ success: false, error: 'Failed to list bounties' }, { status: 500 });
  }
}
