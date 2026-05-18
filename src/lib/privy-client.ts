'use client';

import { getAccessToken } from '@privy-io/react-auth';

export async function getPrivyAccessToken(): Promise<string | null> {
  try {
    const token = await getAccessToken();
    return token ?? null;
  } catch {
    return null;
  }
}
