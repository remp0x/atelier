import {
  createPublicClient,
  http,
  isAddress,
  type Account,
  type Hash,
  type WalletClient,
} from 'viem';
import { base } from 'viem/chains';
import { ERC20_USDC_ABI, USDC_BASE_ADDRESS, USDC_BASE_DECIMALS } from './base-server';

function getClientRpcUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org';
}

function resolveAddress(account: Account | `0x${string}`): `0x${string}` {
  return typeof account === 'string' ? account : account.address;
}

export async function sendBaseUsdcPayment(
  walletClient: WalletClient,
  account: Account | `0x${string}`,
  recipientAddress: `0x${string}`,
  amountUsd: number,
): Promise<`0x${string}`> {
  const senderAddress = resolveAddress(account);

  if (!isAddress(senderAddress)) {
    throw new Error(`Invalid sender address: ${senderAddress}`);
  }
  if (!isAddress(recipientAddress)) {
    throw new Error(`Invalid recipient address: ${recipientAddress}`);
  }

  const publicClient = createPublicClient({
    chain: base,
    transport: http(getClientRpcUrl()),
  });

  const [whole, frac = ''] = String(amountUsd).split('.');
  const padded = (frac + '000000').slice(0, USDC_BASE_DECIMALS);
  const lamports = BigInt(whole) * BigInt(10 ** USDC_BASE_DECIMALS) + BigInt(padded);

  const balance = (await publicClient.readContract({
    address: USDC_BASE_ADDRESS,
    abi: ERC20_USDC_ABI,
    functionName: 'balanceOf',
    args: [senderAddress],
  })) as bigint;

  if (balance === BigInt(0)) {
    throw new Error('No USDC in this wallet. Fund it with USDC on Base first.');
  }

  if (balance < lamports) {
    const have = Number(balance) / 10 ** USDC_BASE_DECIMALS;
    throw new Error(`Insufficient USDC balance. Need $${amountUsd.toFixed(2)}, have $${have.toFixed(2)}`);
  }

  const hash: Hash = await walletClient.writeContract({
    account,
    chain: base,
    address: USDC_BASE_ADDRESS,
    abi: ERC20_USDC_ABI,
    functionName: 'transfer',
    args: [recipientAddress, lamports],
  });

  await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });

  return hash;
}
