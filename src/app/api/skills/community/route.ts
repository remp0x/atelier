export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { listSubmittedSkills, type SubmittedSkill } from '@/lib/atelier-db';
import { SKILL_CATEGORIES, type SkillExample } from '@/components/atelier/market/marketData';

const CATEGORY_NAME_BY_SLUG = new Map(SKILL_CATEGORIES.map((c) => [c.slug, c.name]));

function toSkillExample(row: SubmittedSkill): SkillExample {
  const categoryName = CATEGORY_NAME_BY_SLUG.get(row.category) ?? row.category;
  return {
    name: row.name,
    tagline: row.description,
    category: categoryName,
    tools: ['Markdown'],
    kb: `Submitted ${new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    price: row.pricing === 'free' ? 0 : row.price_usdc,
    pack: 'community',
    slug: row.slug,
    download_url: row.file_url,
    creator_wallet: row.creator_wallet,
    creator_chain: row.creator_chain,
  };
}

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const rows = await listSubmittedSkills({ status: 'live', limit: 500 });
    return NextResponse.json({ success: true, data: rows.map(toSkillExample) });
  } catch (err) {
    console.error('Community skills list failed:', err);
    return NextResponse.json({ success: false, error: 'Failed to load community skills' }, { status: 500 });
  }
}
