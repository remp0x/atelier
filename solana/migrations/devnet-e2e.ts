/**
 * Devnet end-to-end exercise of the 4-tier program against a live cluster.
 * Creates a fresh Token-2022 staked test mint (mirroring $ATELIER), uses real
 * wSOL as the reward mint (the production reward asset), initializes a 4-tier
 * pool under POOL_ID, then runs stake -> fund (native transfer + SyncNative,
 * the production funding path) -> crank -> partial-drip claim -> full-drip
 * claim -> unstake and asserts the amounts.
 *
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *     yarn ts-node migrations/devnet-e2e.ts
 *
 * The provider wallet is admin, funder, and staker; it must be the program's
 * upgrade authority (initialize_pool is gated to it). Tier 0 is zero-duration
 * here -- same fixture as tests/atelier-staking.ts -- so unstake can be
 * verified without waiting out a 15-day lock; production init uses the real
 * 15d/30d/60d/180d tiers via initialize-pool.ts.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  NATIVE_MINT,
  createMint,
  createSyncNativeInstruction,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { AtelierStaking } from "../target/types/atelier_staking";

const BPF_LOADER_UPGRADEABLE = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);
const DAY = 24 * 60 * 60;
const POOL_ID = 0; // fresh staked mint every run, so a constant id never collides
const TIERS = [
  { durationSecs: new BN(0), multiplierBps: new BN(10_000) },
  { durationSecs: new BN(30 * DAY), multiplierBps: new BN(20_000) },
  { durationSecs: new BN(60 * DAY), multiplierBps: new BN(40_000) },
  { durationSecs: new BN(180 * DAY), multiplierBps: new BN(80_000) },
];
const REWARD_DURATION_SECS = 60;
const STAKE_AMOUNT = 1_000_000;
const FUND_AMOUNT = 500_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function main(): Promise<void> {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.atelierStaking as Program<AtelierStaking>;
  const connection = provider.connection;
  const wallet = (provider.wallet as anchor.Wallet).payer;
  const admin = wallet.publicKey;

  console.log("program:", program.programId.toBase58());
  console.log("wallet: ", admin.toBase58());

  console.log("\n[1/7] creating fresh staked test mint (rewards use real wSOL)...");
  const stakedMint = await createMint(
    connection, wallet, admin, null, 6, Keypair.generate(), undefined, TOKEN_2022_PROGRAM_ID,
  );
  const rewardMint = NATIVE_MINT;
  console.log("staked mint (Token-2022):", stakedMint.toBase58());
  console.log("reward mint (wSOL):      ", rewardMint.toBase58());

  const pda = (seeds: Buffer[]): PublicKey =>
    PublicKey.findProgramAddressSync(seeds, program.programId)[0];
  const pool = pda([Buffer.from("pool"), stakedMint.toBuffer(), Buffer.from([POOL_ID])]);
  const stakedVault = pda([Buffer.from("staked_vault"), pool.toBuffer()]);
  const rewardVault = pda([Buffer.from("reward_vault"), pool.toBuffer()]);
  const position = pda([
    Buffer.from("position"), pool.toBuffer(), admin.toBuffer(), Buffer.from([0]),
  ]);
  const programData = PublicKey.findProgramAddressSync(
    [program.programId.toBuffer()], BPF_LOADER_UPGRADEABLE,
  )[0];

  console.log("\n[2/7] initialize_pool (4 tiers, 60s drip, funder=admin)...");
  const initSig = await program.methods
    .initializePool(POOL_ID, TIERS as never, new BN(REWARD_DURATION_SECS), admin)
    .accountsPartial({
      admin,
      program: program.programId,
      programData,
      stakedMint,
      rewardMint,
      pool,
      stakedVault,
      rewardVault,
      stakedTokenProgram: TOKEN_2022_PROGRAM_ID,
      rewardTokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();
  console.log("init tx:", initSig);
  const poolAcct = await program.account.stakePool.fetch(pool);
  assert(poolAcct.tiers.length === 4, `expected 4 tiers, got ${poolAcct.tiers.length}`);
  assert(
    poolAcct.tiers[3].multiplierBps.toNumber() === 80_000,
    `tier 3 multiplier ${poolAcct.tiers[3].multiplierBps.toNumber()}`,
  );
  console.log(`pool: ${pool.toBase58()} (${poolAcct.tiers.length} tiers, drip ${poolAcct.rewardDuration.toString()}s)`);

  console.log(`\n[3/7] stake ${STAKE_AMOUNT} into tier 0...`);
  const stakedAta = await getOrCreateAssociatedTokenAccount(
    connection, wallet, stakedMint, admin, false, undefined, undefined, TOKEN_2022_PROGRAM_ID,
  );
  await mintTo(
    connection, wallet, stakedMint, stakedAta.address, wallet, STAKE_AMOUNT, [], undefined, TOKEN_2022_PROGRAM_ID,
  );
  const stakeSig = await program.methods
    .stake(0, new BN(STAKE_AMOUNT))
    .accountsPartial({
      owner: admin,
      pool,
      position,
      stakedMint,
      stakedVault,
      ownerStakedAta: stakedAta.address,
      rewardVault,
      stakedTokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("stake tx:", stakeSig);

  console.log(`\n[4/7] fund ${FUND_AMOUNT} lamports (wrap into vault) + crank_sync...`);
  const crankSig = await program.methods
    .crankSync()
    .accountsPartial({ funder: admin, pool, rewardVault })
    .preInstructions([
      SystemProgram.transfer({ fromPubkey: admin, toPubkey: rewardVault, lamports: FUND_AMOUNT }),
      createSyncNativeInstruction(rewardVault),
    ])
    .rpc();
  console.log("fund+crank tx:", crankSig);

  console.log("\n[5/7] partial-drip check (~10s into the 60s window)...");
  await sleep(10_000);
  const rewardAta = await getOrCreateAssociatedTokenAccount(
    connection, wallet, rewardMint, admin, false, undefined, undefined, TOKEN_PROGRAM_ID,
  );
  const baseline = (await getAccount(connection, rewardAta.address, "confirmed")).amount;
  const claimIx = () =>
    program.methods
      .claim()
      .accountsPartial({
        owner: admin,
        pool,
        position,
        rewardMint,
        rewardVault,
        ownerRewardAta: rewardAta.address,
        rewardTokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
  await claimIx();
  const partial =
    (await getAccount(connection, rewardAta.address, "confirmed")).amount - baseline;
  console.log(`partial claim: ${partial} of ${FUND_AMOUNT}`);
  assert(
    partial > 0n && partial < BigInt(FUND_AMOUNT),
    `expected a partial drip, got ${partial}`,
  );

  console.log("\n[6/7] full-drip claim (waiting past period_finish)...");
  await sleep(65_000);
  await claimIx();
  const total =
    (await getAccount(connection, rewardAta.address, "confirmed")).amount - baseline;
  console.log(`cumulative claim: ${total} of ${FUND_AMOUNT}`);
  assert(
    total >= BigInt(FUND_AMOUNT - 1) && total <= BigInt(FUND_AMOUNT),
    `expected ~full drip, got ${total}`,
  );

  console.log(`\n[7/7] unstake ${STAKE_AMOUNT} (tier 0, zero duration)...`);
  const unstakeSig = await program.methods
    .unstake(new BN(STAKE_AMOUNT))
    .accountsPartial({
      owner: admin,
      pool,
      position,
      stakedMint,
      stakedVault,
      ownerStakedAta: stakedAta.address,
      rewardVault,
      stakedTokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .rpc({ commitment: "confirmed", skipPreflight: true });
  console.log("unstake tx:", unstakeSig);
  const back = await getAccount(connection, stakedAta.address, "confirmed", TOKEN_2022_PROGRAM_ID);
  assert(
    back.amount === BigInt(STAKE_AMOUNT),
    `expected principal ${STAKE_AMOUNT} back, got ${back.amount}`,
  );
  console.log(`principal back 1:1: ${back.amount}`);

  console.log("\nE2E PASS", JSON.stringify({
    programId: program.programId.toBase58(),
    pool: pool.toBase58(),
    stakedMint: stakedMint.toBase58(),
    rewardMint: rewardMint.toBase58(),
    initSig, stakeSig, crankSig, unstakeSig,
    partialClaim: partial.toString(),
    totalClaim: total.toString(),
    principalBack: back.amount.toString(),
  }, null, 2));
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : err);
    process.exit(1);
  },
);
