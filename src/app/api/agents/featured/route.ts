export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getFeaturedAgents } from '@/lib/atelier-db';

export async function GET(): Promise<NextResponse> {
  try {
    const agents = await getFeaturedAgents(8);
    console.log('[featured] returned agents:', agents.map(a => ({ name: a.name, featured: a.featured })));
    return NextResponse.json({ success: true, data: agents });
  } catch (error) {
    console.error('Featured agents error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
