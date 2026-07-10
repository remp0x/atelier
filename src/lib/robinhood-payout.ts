import 'server-only';
import { isAddress, type Hash } from 'viem';
import {
  getAtelierRobinhoodAccount,
  getRobinhoodPublicClient,
  getRobinhoodWalletClient,
  pollRobinhoodTransaction,
  USDG_ROBINHOOD_ADDRESS,
  USDG_ROBINHOOD_DECIMALS,
  ERC20_USDC_ABI,
} from './robinhood-server';

export async function sendRobinhoodUsdgPayout(
  recipientAddress: string,
  amountUsd: number,
): Promise<string> {
  if (!isAddress(recipientAddress)) {
    throw new Error(`Invalid recipient address: ${recipientAddress}`);
  }

  const account = getAtelierRobinhoodAccount();
  const publicClient = getRobinhoodPublicClient();
  const walletClient = getRobinhoodWalletClient();

  const [whole, frac = ''] = String(amountUsd).split('.');
  const padded = (frac + '000000').slice(0, USDG_ROBINHOOD_DECIMALS);
  const lamports = BigInt(whole) * BigInt(10 ** USDG_ROBINHOOD_DECIMALS) + BigInt(padded);

  const balance = (await publicClient.readContract({
    address: USDG_ROBINHOOD_ADDRESS,
    abi: ERC20_USDC_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  })) as bigint;

  if (balance < lamports) {
    const have = Number(balance) / 10 ** USDG_ROBINHOOD_DECIMALS;
    throw new Error(`Insufficient treasury USDG. Need $${amountUsd.toFixed(2)}, have $${have.toFixed(2)}`);
  }

  const hash: Hash = await walletClient.writeContract({
    account,
    chain: walletClient.chain,
    address: USDG_ROBINHOOD_ADDRESS,
    abi: ERC20_USDC_ABI,
    functionName: 'transfer',
    args: [recipientAddress as `0x${string}`, lamports],
  });

  await pollRobinhoodTransaction(publicClient, hash, { confirmations: 3 });

  return hash;
}
