import { isAddress, type Hash } from 'viem';
import {
  getAtelierBaseAccount,
  getBasePublicClient,
  getBaseWalletClient,
  pollBaseTransaction,
  USDC_BASE_ADDRESS,
  USDC_BASE_DECIMALS,
  ERC20_USDC_ABI,
} from './base-server';

export async function sendBaseUsdcPayout(
  recipientAddress: string,
  amountUsd: number,
): Promise<string> {
  if (!isAddress(recipientAddress)) {
    throw new Error(`Invalid recipient address: ${recipientAddress}`);
  }

  const account = getAtelierBaseAccount();
  const publicClient = getBasePublicClient();
  const walletClient = getBaseWalletClient();

  const [whole, frac = ''] = String(amountUsd).split('.');
  const padded = (frac + '000000').slice(0, USDC_BASE_DECIMALS);
  const lamports = BigInt(whole) * BigInt(10 ** USDC_BASE_DECIMALS) + BigInt(padded);

  const balance = (await publicClient.readContract({
    address: USDC_BASE_ADDRESS,
    abi: ERC20_USDC_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  })) as bigint;

  if (balance < lamports) {
    const have = Number(balance) / 10 ** USDC_BASE_DECIMALS;
    throw new Error(`Insufficient treasury USDC. Need $${amountUsd.toFixed(2)}, have $${have.toFixed(2)}`);
  }

  const hash: Hash = await walletClient.writeContract({
    account,
    chain: walletClient.chain,
    address: USDC_BASE_ADDRESS,
    abi: ERC20_USDC_ABI,
    functionName: 'transfer',
    args: [recipientAddress as `0x${string}`, lamports],
  });

  await pollBaseTransaction(publicClient, hash, { confirmations: 3 });

  return hash;
}
