/**
 * Post-init smoke test of the REAL mainnet pool ($ATELIER staked, SOL rewards,
 * pool_id 1), signed by the treasury wallet (loaded from ../.env.local
 * ATELIER_PRIVATE_KEY, in memory only). The treasury is the pool funder, so it
 * can crank; it also acts as the staker here.
 *
 * Flow: stake 1,000 $ATELIER into tier 0 (15d lock -- principal stays locked,
 * that is expected) -> wrap 0.01 SOL into the reward vault (native transfer +
 * SyncNative, the production funding path) -> crank_sync -> wait ~3 min ->
 * claim with auto-unwrap (expect a small non-zero drip paid as native SOL).
 *
 *   yarn ts-node migrations/mainnet-smoke.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN, Idl } from "@coral-xyz/anchor";
import fs from "fs";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  NATIVE_MINT,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  createCloseAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import bs58 from "bs58";
import { AtelierStaking } from "../target/types/atelier_staking";
import idl from "../target/idl/atelier_staking.json";

const ENV_PATH = `${__dirname}/../../.env.local`;
const TREASURY = new PublicKey("EZkoXXZ5HEWdKwfv7wua7k6Dqv8aQxxHWNakq2gG2Qpb");
const ATELIER_MINT = new PublicKey("7newJUjH7LGsGPDfEq83gxxy2d1q39A84SeUKha8pump");
const POOL_ID = 1;
const STAKE_AMOUNT = 1_000_000_000; // 1,000 $ATELIER (6 dp)
const FUND_LAMPORTS = 10_000_000; // 0.01 SOL
const WAIT_SECS = 180;

function envVal(name: string): string {
  const line = fs
    .readFileSync(ENV_PATH, "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} not found in .env.local`);
  return line.slice(name.length + 1).replace(/^"|"$/g, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function main(): Promise<void> {
  const kp = Keypair.fromSecretKey(bs58.decode(envVal("ATELIER_PRIVATE_KEY")));
  assert(kp.publicKey.equals(TREASURY), "key does not derive the treasury pubkey");
  const connection = new Connection(envVal("NEXT_PUBLIC_SOLANA_RPC_URL"), "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(kp), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  const program = new Program(idl as Idl, provider) as unknown as Program<AtelierStaking>;

  const pda = (seeds: Buffer[]): PublicKey =>
    PublicKey.findProgramAddressSync(seeds, program.programId)[0];
  const pool = pda([Buffer.from("pool"), ATELIER_MINT.toBuffer(), Buffer.from([POOL_ID])]);
  const stakedVault = pda([Buffer.from("staked_vault"), pool.toBuffer()]);
  const rewardVault = pda([Buffer.from("reward_vault"), pool.toBuffer()]);
  const position = pda([
    Buffer.from("position"), pool.toBuffer(), TREASURY.toBuffer(), Buffer.from([0]),
  ]);
  const stakedAta = getAssociatedTokenAddressSync(
    ATELIER_MINT, TREASURY, false, TOKEN_2022_PROGRAM_ID,
  );
  const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, TREASURY, false, TOKEN_PROGRAM_ID);

  console.log("program:", program.programId.toBase58());
  console.log("pool:   ", pool.toBase58(), `(pool_id ${POOL_ID})`);

  const before = await program.account.stakePool.fetch(pool);
  console.log(
    `pool pre-smoke: tiers=${before.tiers.length} drip=${before.rewardDuration.toString()}s ` +
    `funder=${before.funder.toBase58()} totalWeight=${before.totalWeight.toString()}`,
  );
  assert(before.funder.equals(TREASURY), "pool funder is not the treasury");
  assert(before.rewardMint.equals(NATIVE_MINT), "pool reward mint is not wSOL");
  assert(
    before.tiers[3].multiplierBps.toNumber() === 200_000,
    `tier 3 multiplier ${before.tiers[3].multiplierBps.toNumber()} != 200000`,
  );

  console.log(`\n[1/4] stake ${STAKE_AMOUNT} (1,000 $ATELIER) into tier 0 (15d lock)...`);
  const stakeSig = await program.methods
    .stake(0, new BN(STAKE_AMOUNT))
    .accountsPartial({
      owner: TREASURY,
      pool,
      position,
      stakedMint: ATELIER_MINT,
      stakedVault,
      ownerStakedAta: stakedAta,
      rewardVault,
      stakedTokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed" });
  console.log("stake tx:", stakeSig);

  console.log(`\n[2/4] wrap ${FUND_LAMPORTS} lamports into the reward vault + crank_sync...`);
  const crankSig = await program.methods
    .crankSync()
    .accountsPartial({ funder: TREASURY, pool, rewardVault })
    .preInstructions([
      SystemProgram.transfer({
        fromPubkey: TREASURY,
        toPubkey: rewardVault,
        lamports: FUND_LAMPORTS,
      }),
      createSyncNativeInstruction(rewardVault),
    ])
    .rpc({ commitment: "confirmed" });
  console.log("fund+crank tx:", crankSig);

  const after = await program.account.stakePool.fetch(pool);
  const now = Math.floor(Date.now() / 1000);
  console.log(
    `pool post-crank: rewardRate=${after.rewardRate.toString()} ` +
    `periodFinish=${after.periodFinish.toString()} (now+${after.periodFinish.toNumber() - now}s) ` +
    `totalWeight=${after.totalWeight.toString()}`,
  );
  assert(!after.rewardRate.isZero(), "reward_rate is zero after crank");
  assert(
    after.periodFinish.toNumber() > now + 600_000,
    `period_finish ${after.periodFinish.toString()} not ~7d out`,
  );

  console.log(`\n[3/4] waiting ${WAIT_SECS}s for a measurable drip...`);
  await sleep(WAIT_SECS * 1000);

  console.log("[4/4] claim (with wSOL auto-unwrap to native SOL)...");
  const solBefore = BigInt(await connection.getBalance(TREASURY, "confirmed"));
  const claimSig = await program.methods
    .claim()
    .accountsPartial({
      owner: TREASURY,
      pool,
      position,
      rewardMint: NATIVE_MINT,
      rewardVault,
      ownerRewardAta: wsolAta,
      rewardTokenProgram: TOKEN_PROGRAM_ID,
    })
    .preInstructions([
      createAssociatedTokenAccountIdempotentInstruction(
        TREASURY, wsolAta, TREASURY, NATIVE_MINT, TOKEN_PROGRAM_ID,
      ),
    ])
    .postInstructions([
      createCloseAccountInstruction(wsolAta, TREASURY, TREASURY, [], TOKEN_PROGRAM_ID),
    ])
    .rpc({ commitment: "confirmed" });
  const solAfter = BigInt(await connection.getBalance(TREASURY, "confirmed"));
  console.log("claim tx:", claimSig);
  // Native delta = claimed drip - tx fee (the wSOL ATA rent round-trips within
  // the tx). The drip (~2,900 lamports) and the fee (~5,000) are the same order,
  // so read the exact claimed amount from the pool's claim counter instead.
  const poolFinal = await program.account.stakePool.fetch(pool);
  const claimed = BigInt(poolFinal.totalRewardsClaimed.toString());
  console.log(`claimed (pool counter): ${claimed} lamports; native delta ${solAfter - solBefore}`);
  assert(claimed > 0n, "claimed nothing after the wait");
  assert(claimed < 100_000n, `claimed ${claimed} -- far more than the drip should allow`);

  const vaultBal = (await getAccount(connection, stakedVault, "confirmed", TOKEN_2022_PROGRAM_ID)).amount;
  console.log("\nSMOKE PASS", JSON.stringify({
    pool: pool.toBase58(),
    stakeSig, crankSig, claimSig,
    stakedVaultBalance: vaultBal.toString(),
    rewardRate: after.rewardRate.toString(),
    periodFinish: after.periodFinish.toString(),
    claimedLamports: claimed.toString(),
  }, null, 2));
  console.log(
    "\nNote: the 1,000 $ATELIER position stays locked 15 days (tier 0); " +
    "the remaining ~0.01 SOL tranche keeps dripping to it over 7 days.",
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : err);
    process.exit(1);
  },
);
