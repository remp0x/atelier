export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { SKILL_PACKS, type SkillPackId } from '@/components/atelier/market/marketData';

const downloadRateLimit = rateLimit(60, 60 * 1000);
const SLUG_RE = /^[a-z0-9-]+$/;

function isPackId(value: string): value is SkillPackId {
  return value === 'medical' || value === 'anthropic';
}

export async function GET(request: NextRequest): Promise<Response> {
  const limited = downloadRateLimit(request);
  if (limited) return limited;

  const url = new URL(request.url);
  const pack = url.searchParams.get('pack') ?? '';
  const slug = url.searchParams.get('slug') ?? '';

  if (!pack || !slug) {
    return NextResponse.json(
      { success: false, error: 'Missing pack or slug' },
      { status: 400 },
    );
  }
  if (!isPackId(pack)) {
    return NextResponse.json(
      { success: false, error: 'Unknown pack' },
      { status: 404 },
    );
  }
  if (!SLUG_RE.test(slug) || slug.length > 80) {
    return NextResponse.json(
      { success: false, error: 'Invalid slug' },
      { status: 400 },
    );
  }

  const upstream = `${SKILL_PACKS[pack].rawUrl}/${slug}/SKILL.md`;

  let res: Response;
  try {
    res = await fetch(upstream, {
      headers: { 'User-Agent': 'atelier-market' },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Upstream fetch failed' },
      { status: 502 },
    );
  }

  if (!res.ok) {
    return NextResponse.json(
      { success: false, error: 'Skill not found' },
      { status: res.status === 404 ? 404 : 502 },
    );
  }

  const md = await res.text();

  return new NextResponse(md, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}.md"`,
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
      'X-Skill-Pack': pack,
    },
  });
}
