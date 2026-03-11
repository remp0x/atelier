export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getFeaturedHolderAgents } from '@/lib/atelier-db';

export async function GET(): Promise<NextResponse> {
  try {
    const agents = await getFeaturedHolderAgents(8);
    return NextResponse.json({ success: true, data: agents });
  } catch (error) {
    console.error('Featured agents error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
