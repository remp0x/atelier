import type { NextRequest } from 'next/server';
import { getAddress, isAddress } from 'viem';

import { authenticateUserRequest } from './session';
import { WalletAuthError as SolanaWalletAuthError } from './solana-auth';
import { authenticateEvmRequest, EvmAuthError } from './evm-auth';

export type WalletChain = 'solana' | 'base';

export interface WalletAuthFields {
  wallet: string;
  wallet_sig: string;
  wallet_sig_ts: number;
  wallet_chain?: WalletChain;
}

export interface VerifiedWallet {
  address: string;
  chain: WalletChain;
}

export class WalletAuthError extends Error {
  readonly chain?: WalletChain;
  constructor(message: string, options?: { cause?: unknown; chain?: WalletChain }) {
    super(message);
    this.name = 'WalletAuthError';
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
    this.chain = options?.chain;
  }
}

const BASE58_ALPHABET = /^[1-9A-HJ-NP-Za-km-z]+$/;

export function detectWalletChain(walletAddress: string): WalletChain | null {
  if (!walletAddress) return null;
  if (walletAddress.startsWith('0x') && walletAddress.length === 42 && isAddress(walletAddress)) {
    return 'base';
  }
  // Solana public keys are base58, 32 bytes → 32–44 characters when encoded.
  if (walletAddress.length >= 32 && walletAddress.length <= 44 && BASE58_ALPHABET.test(walletAddress)) {
    return 'solana';
  }
  return null;
}

function readChainHint(
  request: NextRequest | Request,
  body: Record<string, unknown> | null,
): WalletChain | null {
  const fromBody = body?.wallet_chain;
  if (typeof fromBody === 'string') {
    const normalized = fromBody.toLowerCase();
    if (normalized === 'solana' || normalized === 'base') return normalized;
  }
  const fromHeader = request.headers.get('x-atelier-wallet-chain');
  if (fromHeader) {
    const normalized = fromHeader.toLowerCase();
    if (normalized === 'solana' || normalized === 'base') return normalized;
  }
  return null;
}

export async function authenticateWalletRequest(
  request: NextRequest | Request,
  body: Record<string, unknown> | null,
  providedWallet?: string,
): Promise<VerifiedWallet> {
  const walletField = typeof body?.wallet === 'string' ? body.wallet : undefined;
  const hinted = readChainHint(request, body);
  const inferred = walletField ? detectWalletChain(walletField) : null;
  const chain: WalletChain = hinted ?? inferred ?? 'solana';

  try {
    if (chain === 'base') {
      const address = await authenticateEvmRequest(request, body, providedWallet);
      return { address, chain };
    }

    const address = await authenticateUserRequest(request, body, providedWallet ?? null);
    // Session cookies are chain-agnostic; if the resulting address looks like an EVM
    // address, surface that to callers so they can apply chain-specific logic.
    const resolvedChain: WalletChain = detectWalletChain(address) === 'base' ? 'base' : 'solana';
    const normalizedAddress = resolvedChain === 'base' && isAddress(address) ? getAddress(address) : address;
    return { address: normalizedAddress, chain: resolvedChain };
  } catch (err) {
    if (err instanceof EvmAuthError || err instanceof SolanaWalletAuthError) {
      throw new WalletAuthError(err.message, { cause: err, chain });
    }
    throw err;
  }
}
