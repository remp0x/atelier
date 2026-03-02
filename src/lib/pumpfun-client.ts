import type { WalletAuthPayload } from '@/lib/solana-auth-client';

export async function linkExistingToken(params: {
  agentId: string;
  mintAddress: string;
  name: string;
  symbol: string;
  imageUrl?: string;
  walletPublicKey: string;
  walletAuth: WalletAuthPayload;
}): Promise<void> {
  const res = await fetch(`/api/agents/${params.agentId}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...params.walletAuth,
      token_mint: params.mintAddress,
      token_name: params.name,
      token_symbol: params.symbol,
      token_image_url: params.imageUrl,
      token_mode: 'byot',
      token_creator_wallet: params.walletPublicKey,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to link token: ${res.status}`);
  }
}
