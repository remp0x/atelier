import 'server-only';
import { createSolanaKitSigner } from '@privy-io/node/solana-kit';
import {
  address,
  appendTransactionMessageInstruction,
  createSolanaRpc,
  createTransactionMessage,
  getBase58Decoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signAndSendTransactionMessageWithSigners,
} from '@solana/kit';
import { findAssociatedTokenPda, getTransferInstruction, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { getPrivyServer } from './privy-server';

// CAIP-2 for Solana mainnet (same id used by the x402 facilitator). Required by
// the Privy signer to actually send (not just sign) the transaction.
const SOLANA_MAINNET_CAIP2 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

// Resolve a Privy-managed wallet's on-chain address from its id (the agent record
// stores the id reliably; the address column is not guaranteed to be the server wallet).
export async function getPrivySolanaWalletAddress(walletId: string): Promise<string> {
  const wallet = await getPrivyServer().wallets().get(walletId);
  if (!wallet?.address) throw new Error(`Privy wallet ${walletId} has no address`);
  return wallet.address;
}

// Pull `rawAmount` micro-USDC from an agent's Privy-managed Solana wallet into
// the Earn treasury, signed + sent server-side by that wallet via Privy. Returns
// the transfer signature (base58) so the existing deposit flow can verify the
// credit and account for it. Powers single-call agent deposits (no client push).
export async function pullAgentUsdcToTreasury(params: {
  privySolanaWalletId: string;
  agentAddress: string;
  treasuryAddress: string;
  usdcMint: string;
  rawAmount: bigint;
  rpcUrl: string;
}): Promise<string> {
  const { privySolanaWalletId, agentAddress, treasuryAddress, usdcMint, rawAmount, rpcUrl } = params;

  const signer = createSolanaKitSigner(getPrivyServer(), {
    walletId: privySolanaWalletId,
    address: address(agentAddress),
    caip2: SOLANA_MAINNET_CAIP2,
  });

  const mint = address(usdcMint);
  const [sourceAta] = await findAssociatedTokenPda({
    owner: address(agentAddress),
    mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const [destinationAta] = await findAssociatedTokenPda({
    owner: address(treasuryAddress),
    mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  const transferIx = getTransferInstruction({
    source: sourceAta,
    destination: destinationAta,
    authority: signer,
    amount: rawAmount,
  });

  const rpc = createSolanaRpc(rpcUrl);
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstruction(transferIx, m),
  );

  const signatureBytes = await signAndSendTransactionMessageWithSigners(message);
  return getBase58Decoder().decode(signatureBytes);
}
