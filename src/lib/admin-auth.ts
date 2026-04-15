import type { NextRequest } from 'next/server';
import { requireWalletAuth, WalletAuthError } from './solana-auth';

export class AdminAuthError extends Error {
  constructor(message: string, public readonly status: number = 401) {
    super(message);
    this.name = 'AdminAuthError';
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export interface AdminAuthInput {
  wallet?: string;
  wallet_sig?: string;
  wallet_sig_ts?: number;
}

export function requireAdminAuth(request: NextRequest, body: AdminAuthInput): string {
  const adminKey = process.env.ATELIER_ADMIN_KEY;
  if (!adminKey) {
    throw new AdminAuthError('Admin key not configured on server', 500);
  }
  const treasuryWallet = process.env.ATELIER_TREASURY_WALLET;
  if (!treasuryWallet) {
    throw new AdminAuthError('Treasury wallet not configured on server', 500);
  }

  const auth = request.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) {
    throw new AdminAuthError('Missing Authorization Bearer token');
  }
  const provided = auth.slice(7).trim();
  if (!provided || !timingSafeEqual(provided, adminKey)) {
    throw new AdminAuthError('Invalid admin key');
  }

  const { wallet, wallet_sig, wallet_sig_ts } = body;
  if (!wallet || !wallet_sig || !wallet_sig_ts) {
    throw new AdminAuthError('wallet, wallet_sig, and wallet_sig_ts are required');
  }

  if (wallet !== treasuryWallet) {
    throw new AdminAuthError('Wallet is not authorized as admin', 403);
  }

  try {
    return requireWalletAuth({ wallet, wallet_sig, wallet_sig_ts });
  } catch (err) {
    const message = err instanceof WalletAuthError ? err.message : 'Admin auth failed';
    throw new AdminAuthError(message);
  }
}
