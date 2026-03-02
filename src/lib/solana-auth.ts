import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const SIGNATURE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 30_000;

export function verifyWalletSignature(wallet: string, signature: string, message: string): boolean {
  const messageBytes = new TextEncoder().encode(message);
  const signatureBytes = bs58.decode(signature);
  const publicKeyBytes = new PublicKey(wallet).toBytes();

  return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
}

export interface WalletAuthFields {
  wallet: string;
  wallet_sig: string;
  wallet_sig_ts: number;
}

export function requireWalletAuth(
  fields: WalletAuthFields,
  expectedWallet?: string | null,
): string {
  const { wallet, wallet_sig, wallet_sig_ts } = fields;

  if (!wallet || !wallet_sig || !wallet_sig_ts) {
    throw new WalletAuthError('wallet, wallet_sig, and wallet_sig_ts are required');
  }

  if (expectedWallet && wallet !== expectedWallet) {
    throw new WalletAuthError('Wallet mismatch');
  }

  const now = Date.now();

  if (wallet_sig_ts > now + CLOCK_SKEW_MS) {
    throw new WalletAuthError('Signature timestamp is in the future');
  }
  if (now - wallet_sig_ts > SIGNATURE_MAX_AGE_MS) {
    throw new WalletAuthError('Signature expired');
  }

  const message = `atelier:${wallet}:${wallet_sig_ts}`;
  let valid: boolean;
  try {
    valid = verifyWalletSignature(wallet, wallet_sig, message);
  } catch {
    throw new WalletAuthError('Invalid signature format');
  }

  if (!valid) {
    throw new WalletAuthError('Invalid wallet signature');
  }

  return wallet;
}

export class WalletAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalletAuthError';
  }
}
