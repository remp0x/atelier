import { NextResponse } from 'next/server';
import { getMetricsData } from '@/lib/atelier-db';

export const revalidate = 60;

export async function GET(): Promise<NextResponse> {
  try {
    const data = await getMetricsData();
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to fetch metrics' }, { status: 500 });
  }
}
