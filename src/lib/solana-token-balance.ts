import { PublicKey } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getAccount,
  getMint,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from '@solana/spl-token';
import { getServerConnection } from './solana-server';

export const ATELIER_TOKEN_MINT = new PublicKey(
  '7newJUjH7LGsGPDfEq83gxxy2d1q39A84SeUKha8pump',
);

export const HOLDER_THRESHOLD = 1_000_000;

let cachedDecimals: number | null = null;

async function getTokenDecimals(): Promise<number> {
  if (cachedDecimals !== null) return cachedDecimals;
  const connection = getServerConnection();
  const mint = await getMint(connection, ATELIER_TOKEN_MINT);
  cachedDecimals = mint.decimals;
  return cachedDecimals;
}

export async function getAtelierTokenBalance(walletAddress: string): Promise<number> {
  const connection = getServerConnection();
  const owner = new PublicKey(walletAddress);
  const ata = await getAssociatedTokenAddress(ATELIER_TOKEN_MINT, owner);

  try {
    const account = await getAccount(connection, ata);
    const decimals = await getTokenDecimals();
    return Number(account.amount) / 10 ** decimals;
  } catch (e) {
    if (e instanceof TokenAccountNotFoundError || e instanceof TokenInvalidAccountOwnerError) {
      return 0;
    }
    throw e;
  }
}

export async function isAtelierHolder(walletAddress: string): Promise<boolean> {
  const balance = await getAtelierTokenBalance(walletAddress);
  return balance >= HOLDER_THRESHOLD;
}
