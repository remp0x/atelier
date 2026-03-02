export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getDistinctProviderModels } from '@/lib/atelier-db';

export async function GET() {
  try {
    const models = await getDistinctProviderModels();
    return NextResponse.json({ success: true, data: models });
  } catch (error) {
    console.error('Models list error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
