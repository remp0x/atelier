import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { ATELIER_PUBKEY } from './solana-server';

// The Parquet Earn treasury is a dedicated, segregated custody wallet. It must
// never be the operational payout wallet (ATELIER_PRIVATE_KEY): commingling
// custodied depositor funds with operational funds is the cardinal sin of a
// custodial product, so segregation is enforced at load time, not by convention.

let cachedKeypair: Keypair | null = null;

export function getEarnTreasuryKeypair(): Keypair {
  if (cachedKeypair) return cachedKeypair;

  const encoded = process.env.PARQUET_EARN_TREASURY_KEY;
  if (!encoded) throw new Error('PARQUET_EARN_TREASURY_KEY env var not set');

  const keypair = Keypair.fromSecretKey(bs58.decode(encoded));

  if (keypair.publicKey.equals(ATELIER_PUBKEY)) {
    throw new Error(
      'PARQUET_EARN_TREASURY_KEY must be a dedicated wallet, not the operational Atelier wallet -- custodied funds must never commingle with operational funds',
    );
  }

  cachedKeypair = keypair;
  return keypair;
}

export function getEarnTreasuryPubkey(): PublicKey {
  return getEarnTreasuryKeypair().publicKey;
}
