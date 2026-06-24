import { getAddress, isAddress, encodeFunctionData, parseEther } from 'viem';
import {
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from '@solana/spl-token';
import { USDC_MINT } from './solana-pay';
import {
  getAtelierKeypair,
  getServerConnection,
  sendAndConfirmServerTx,
  pollTransactionConfirmation,
} from './solana-server';
import {
  getAtelierBaseAccount,
  getBasePublicClient,
  getBaseWalletClient,
  pollBaseTransaction,
  USDC_BASE_ADDRESS,
  ERC20_USDC_ABI,
} from './base-server';
import { getPrivyServer } from './privy-server';

export const SERVER_WALLETS_ENABLED: boolean = !!(
  process.env.PRIVY_APP_SECRET && process.env.NEXT_PUBLIC_PRIVY_APP_ID
);

export interface ProvisionedServerWallet {
  id: string;
  address: string;
}

export interface ProvisionedServerWallets {
  evm: ProvisionedServerWallet | null;
  solana: ProvisionedServerWallet | null;
}

/**
 * Create app-managed Solana + EVM server wallets for a headless (API) agent so it
 * can receive USDC payouts on both chains without a browser/Privy session.
 * Idempotent via privy-idempotency-key keyed on the caller-supplied base.
 * Best-effort: a failure on one chain returns null for that chain, never throws.
 */
export async function provisionServerWallets(idempotencyBase: string): Promise<ProvisionedServerWallets> {
  if (!SERVER_WALLETS_ENABLED) return { evm: null, solana: null };

  const privy = getPrivyServer();
  const out: ProvisionedServerWallets = { evm: null, solana: null };

  try {
    const evm = await privy.wallets().create({
      chain_type: 'ethereum',
      idempotency_key: `${idempotencyBase}-evm`,
    });
    out.evm = { id: evm.id, address: getAddress(evm.address) };
  } catch (err) {
    console.error('[privy-server-wallets] EVM create failed:', err instanceof Error ? err.message : err);
  }

  try {
    const sol = await privy.wallets().create({
      chain_type: 'solana',
      idempotency_key: `${idempotencyBase}-solana`,
    });
    out.solana = { id: sol.id, address: sol.address };
  } catch (err) {
    console.error('[privy-server-wallets] Solana create failed:', err instanceof Error ? err.message : err);
  }

  return out;
}

export type WalletChain = 'solana' | 'base';

const SOLANA_MAINNET_CAIP2 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const BASE_MAINNET_CAIP2 = 'eip155:8453';
const BASE_CHAIN_ID = 8453;
const USDC_DECIMALS = 6;

// Sweeps move USDC out of an app-managed Privy wallet that holds zero native gas.
// The Atelier treasury tops the wallet up to these floors on demand so the agent's
// wallet can pay its own transaction (and ATA rent on Solana) before the transfer.
const SOL_GAS_FLOOR_LAMPORTS = Math.floor(0.01 * LAMPORTS_PER_SOL);
const SOL_GAS_FLOOR_NO_ATA_LAMPORTS = Math.floor(0.003 * LAMPORTS_PER_SOL);
const BASE_GAS_FLOOR_WEI = parseEther('0.00005');

function usdToMicro(usd: number): bigint {
  if (!Number.isFinite(usd) || usd <= 0) throw new Error('Amount must be a positive number');
  const [whole, frac = ''] = usd.toFixed(USDC_DECIMALS).split('.');
  return BigInt(whole) * BigInt(10 ** USDC_DECIMALS) + BigInt(frac || '0');
}

function microToUsd(micro: bigint): number {
  return Number(micro) / 10 ** USDC_DECIMALS;
}

async function solanaUsdcBalance(address: string): Promise<bigint> {
  const connection = getServerConnection();
  const ata = await getAssociatedTokenAddress(USDC_MINT, new PublicKey(address));
  try {
    const account = await getAccount(connection, ata);
    return account.amount;
  } catch (err) {
    if (err instanceof TokenAccountNotFoundError || err instanceof TokenInvalidAccountOwnerError) return BigInt(0);
    throw err;
  }
}

async function baseUsdcBalance(address: string): Promise<bigint> {
  const publicClient = getBasePublicClient();
  return (await publicClient.readContract({
    address: USDC_BASE_ADDRESS,
    abi: ERC20_USDC_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
  })) as bigint;
}

export async function getServerWalletUsdcBalance(address: string, chain: WalletChain): Promise<number> {
  const micro = chain === 'solana' ? await solanaUsdcBalance(address) : await baseUsdcBalance(address);
  return microToUsd(micro);
}

export async function getServerWalletAddress(walletId: string): Promise<string> {
  const privy = getPrivyServer();
  const wallet = await privy.wallets().get(walletId);
  return wallet.address;
}

async function ensureSolGas(walletAddress: string, floorLamports: number): Promise<void> {
  const connection = getServerConnection();
  const target = new PublicKey(walletAddress);
  const balance = await connection.getBalance(target);
  if (balance >= floorLamports) return;

  const keypair = getAtelierKeypair();
  const ix = SystemProgram.transfer({
    fromPubkey: keypair.publicKey,
    toPubkey: target,
    lamports: floorLamports - balance,
  });
  await sendAndConfirmServerTx(connection, [ix], keypair);
}

async function ensureBaseGas(walletAddress: string): Promise<void> {
  const publicClient = getBasePublicClient();
  const balance = await publicClient.getBalance({ address: walletAddress as `0x${string}` });
  if (balance >= BASE_GAS_FLOOR_WEI) return;

  const walletClient = getBaseWalletClient();
  const account = getAtelierBaseAccount();
  const hash = await walletClient.sendTransaction({
    account,
    chain: walletClient.chain,
    to: walletAddress as `0x${string}`,
    value: BASE_GAS_FLOOR_WEI - balance,
  });
  await pollBaseTransaction(publicClient, hash, { confirmations: 1 });
}

export interface WithdrawResult {
  txHash: string;
  amountUsd: number;
  chain: WalletChain;
}

/**
 * Sweep USDC out of an agent's app-managed Privy server wallet to `to`.
 * Privy signs and broadcasts with the wallet key (held in its TEE); we only
 * build the transfer and front the gas. `amountUsd` omitted = full balance.
 */
export async function withdrawUsdcFromServerWallet(params: {
  walletId: string;
  walletAddress: string;
  chain: WalletChain;
  to: string;
  amountUsd?: number;
}): Promise<WithdrawResult> {
  if (!SERVER_WALLETS_ENABLED) throw new Error('Server wallets are not enabled');
  return params.chain === 'solana'
    ? withdrawSolanaUsdc(params.walletId, params.walletAddress, params.to, params.amountUsd)
    : withdrawBaseUsdc(params.walletId, params.walletAddress, params.to, params.amountUsd);
}

async function withdrawSolanaUsdc(
  walletId: string,
  walletAddress: string,
  to: string,
  amountUsd?: number,
): Promise<WithdrawResult> {
  const connection = getServerConnection();

  let recipient: PublicKey;
  try {
    recipient = new PublicKey(to);
  } catch {
    throw new Error('Invalid Solana destination address');
  }
  const owner = new PublicKey(walletAddress);

  const available = await solanaUsdcBalance(walletAddress);
  const amount = amountUsd === undefined ? available : usdToMicro(amountUsd);
  if (amount <= BigInt(0)) throw new Error('No USDC available to withdraw');
  if (amount > available) {
    throw new Error(`Insufficient USDC: requested $${microToUsd(amount).toFixed(2)}, available $${microToUsd(available).toFixed(2)}`);
  }

  const senderAta = await getAssociatedTokenAddress(USDC_MINT, owner);
  const recipientAta = await getAssociatedTokenAddress(USDC_MINT, recipient, true);

  const instructions: TransactionInstruction[] = [];
  let recipientAtaExists = true;
  try {
    await getAccount(connection, recipientAta);
  } catch (err) {
    if (err instanceof TokenAccountNotFoundError || err instanceof TokenInvalidAccountOwnerError) recipientAtaExists = false;
    else throw err;
  }
  if (!recipientAtaExists) {
    instructions.push(createAssociatedTokenAccountInstruction(owner, recipientAta, recipient, USDC_MINT));
  }
  instructions.push(createTransferInstruction(senderAta, recipientAta, owner, amount));

  await ensureSolGas(walletAddress, recipientAtaExists ? SOL_GAS_FLOOR_NO_ATA_LAMPORTS : SOL_GAS_FLOOR_LAMPORTS);

  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const message = new TransactionMessage({
    payerKey: owner,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);

  const privy = getPrivyServer();
  const { hash } = await privy.wallets().solana().signAndSendTransaction(walletId, {
    caip2: SOLANA_MAINNET_CAIP2,
    transaction: transaction.serialize(),
  });

  await pollTransactionConfirmation(connection, hash);
  return { txHash: hash, amountUsd: microToUsd(amount), chain: 'solana' };
}

async function withdrawBaseUsdc(
  walletId: string,
  walletAddress: string,
  to: string,
  amountUsd?: number,
): Promise<WithdrawResult> {
  if (!isAddress(to)) throw new Error('Invalid Base destination address');
  const publicClient = getBasePublicClient();

  const available = await baseUsdcBalance(walletAddress);
  const amount = amountUsd === undefined ? available : usdToMicro(amountUsd);
  if (amount <= BigInt(0)) throw new Error('No USDC available to withdraw');
  if (amount > available) {
    throw new Error(`Insufficient USDC: requested $${microToUsd(amount).toFixed(2)}, available $${microToUsd(available).toFixed(2)}`);
  }

  await ensureBaseGas(walletAddress);

  const data = encodeFunctionData({
    abi: ERC20_USDC_ABI,
    functionName: 'transfer',
    args: [getAddress(to), amount],
  });

  const privy = getPrivyServer();
  const { hash } = await privy.wallets().ethereum().sendTransaction(walletId, {
    caip2: BASE_MAINNET_CAIP2,
    params: {
      transaction: {
        to: USDC_BASE_ADDRESS,
        data,
        value: 0,
        chain_id: BASE_CHAIN_ID,
      },
    },
  });

  await pollBaseTransaction(publicClient, hash as `0x${string}`, { confirmations: 1 });
  return { txHash: hash, amountUsd: microToUsd(amount), chain: 'base' };
}

/**
 * Export the raw private key of an app-managed server wallet. Privy performs the
 * HPKE exchange internally and returns the plaintext key (hex for EVM, base58 for
 * Solana). Caller MUST gate this behind owner authentication.
 */
export class WalletExportUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalletExportUnavailableError';
  }
}

export async function exportServerWalletPrivateKey(walletId: string): Promise<string> {
  if (!SERVER_WALLETS_ENABLED) throw new Error('Server wallets are not enabled');
  const privy = getPrivyServer();

  // Privy only allows export of wallets that have an owner. Our wallets are
  // provisioned ownerless, so export requires assigning a P-256 authorization
  // key as owner and signing the request with it (PRIVY_AUTHORIZATION_KEY =
  // base64 PKCS8 private key). Without that setup Privy returns 401 "a wallet
  // must have an owner"; surface that as a typed, actionable error.
  const authKey = process.env.PRIVY_AUTHORIZATION_KEY;
  try {
    const { private_key } = await privy.wallets().export(
      walletId,
      authKey ? { authorization_context: { authorization_private_keys: [authKey] } } : {},
    );
    return private_key;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/must have an owner|owner to perform|authoriz/i.test(message)) {
      throw new WalletExportUnavailableError(
        'This server wallet has no owner key, so its private key cannot be exported. Enabling export requires provisioning wallets with a Privy authorization key.',
      );
    }
    throw err;
  }
}
