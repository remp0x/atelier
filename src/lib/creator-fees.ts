import { PublicKey } from '@solana/web3.js';
import { OnlinePumpSdk } from '@pump-fun/pump-sdk';
import { getServerConnection, ATELIER_PUBKEY } from './solana-server';

function getSdk(): OnlinePumpSdk {
  return new OnlinePumpSdk(getServerConnection());
}

export async function getVaultBalanceLamports(): Promise<number> {
  const sdk = getSdk();
  const balance = await sdk.getCreatorVaultBalanceBothPrograms(ATELIER_PUBKEY);
  return balance.toNumber();
}

export interface TokenDistributableFee {
  mint: string;
  distributableFeesLamports: number;
  canDistribute: boolean;
  isGraduated: boolean;
}

export async function getPerTokenDistributableFees(
  mints: string[],
): Promise<TokenDistributableFee[]> {
  if (mints.length === 0) return [];

  const sdk = getSdk();
  const results: TokenDistributableFee[] = [];

  for (const mint of mints) {
    try {
      const result = await sdk.getMinimumDistributableFee(new PublicKey(mint));
      results.push({
        mint,
        distributableFeesLamports: result.distributableFees.toNumber(),
        canDistribute: result.canDistribute,
        isGraduated: result.isGraduated,
      });
    } catch {
      results.push({
        mint,
        distributableFeesLamports: 0,
        canDistribute: false,
        isGraduated: false,
      });
    }
  }

  return results;
}
