import type { NextRequest } from 'next/server';
import { getAddress, isAddress, verifyMessage, type Hex } from 'viem';

const SIGNATURE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 30_000;

export class EvmAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvmAuthError';
  }
}

export interface EvmAuthFields {
  wallet: string;
  wallet_sig: string;
  wallet_sig_ts: number;
}

function normalizeSignature(signature: string): Hex {
  const hex = signature.startsWith('0x') ? signature : `0x${signature}`;
  if (!/^0x[0-9a-fA-F]+$/.test(hex)) {
    throw new EvmAuthError('Invalid signature format');
  }
  return hex as Hex;
}

export async function verifyEvmWalletSignature(
  address: string,
  signatureHex: string,
  message: string,
): Promise<boolean> {
  if (!isAddress(address)) return false;
  const signature = normalizeSignature(signatureHex);
  return verifyMessage({
    address: getAddress(address),
    message,
    signature,
  });
}

export function requireEvmWalletAuth(
  fields: EvmAuthFields,
  expectedWallet?: string | null,
): Promise<string> {
  return verifyEvmFields(fields, expectedWallet);
}

async function verifyEvmFields(
  fields: EvmAuthFields,
  expectedWallet?: string | null,
): Promise<string> {
  const { wallet, wallet_sig, wallet_sig_ts } = fields;

  if (!wallet || !wallet_sig || !wallet_sig_ts) {
    throw new EvmAuthError('wallet, wallet_sig, and wallet_sig_ts are required');
  }

  if (!isAddress(wallet)) {
    throw new EvmAuthError('Invalid signature format');
  }

  const checksummed = getAddress(wallet);

  if (expectedWallet) {
    const expectedNormalized = isAddress(expectedWallet) ? getAddress(expectedWallet) : expectedWallet;
    if (checksummed !== expectedNormalized) {
      throw new EvmAuthError('Wallet mismatch');
    }
  }

  const now = Date.now();

  if (wallet_sig_ts > now + CLOCK_SKEW_MS) {
    throw new EvmAuthError('Signature timestamp is in the future');
  }
  if (now - wallet_sig_ts > SIGNATURE_MAX_AGE_MS) {
    throw new EvmAuthError('Signature expired');
  }

  // Use the raw wallet string as the user signed it; viem normalizes on verify.
  const message = `atelier:${wallet}:${wallet_sig_ts}`;

  let valid: boolean;
  try {
    valid = await verifyEvmWalletSignature(checksummed, wallet_sig, message);
  } catch (err) {
    if (err instanceof EvmAuthError) throw err;
    throw new EvmAuthError('Invalid signature format');
  }

  if (!valid) {
    // Fallback: some wallets present the address checksummed in the UI; if the user
    // signed the checksummed form while the request body sent lowercase (or vice versa),
    // try the alternate spelling before declaring failure.
    const alt = `atelier:${checksummed}:${wallet_sig_ts}`;
    if (alt !== message) {
      try {
        valid = await verifyEvmWalletSignature(checksummed, wallet_sig, alt);
      } catch {
        valid = false;
      }
    }
  }

  if (!valid) {
    throw new EvmAuthError('Invalid wallet signature');
  }

  return checksummed;
}

export async function authenticateEvmRequest(
  _request: NextRequest | Request,
  body: Record<string, unknown> | null,
  providedWallet?: string,
): Promise<string> {
  if (!body || body.wallet === undefined || body.wallet_sig === undefined || body.wallet_sig_ts === undefined) {
    throw new EvmAuthError('wallet, wallet_sig, and wallet_sig_ts are required');
  }

  return verifyEvmFields(
    {
      wallet: String(body.wallet),
      wallet_sig: String(body.wallet_sig),
      wallet_sig_ts: Number(body.wallet_sig_ts),
    },
    providedWallet ?? null,
  );
}
