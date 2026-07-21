/**
 * One-time retirement pass over the LEGACY mainnet pool (pre-pool_id layout,
 * USDC rewards, pool H4XFUj2kSVq5r48LAbJtaS5BVBzCVMS5S2z8GPSPFknm). Run BEFORE
 * upgrading the mainnet program: the upgrade changes the pool seeds, after
 * which this pool is permanently unreachable.
 *
 * 1. Asserts the ONLY position in the pool belongs to the treasury (nobody
 *    else ever staked) -- aborts loudly otherwise.
 * 2. Claims the treasury's accrued USDC drip (recovers what has vested so
 *    far; the rest of the tranche and the 1,000 $ATELIER principal, still
 *    15d-locked, are written off).
 *
 *   yarn ts-node migrations/retire-v1-claim.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, Idl } from "@coral-xyz/anchor";
import fs from "fs";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import bs58 from "bs58";
import { AtelierStaking } from "../target/types/atelier_staking";
import idl from "../target/idl/atelier_staking.json";

const ENV_PATH = `${__dirname}/../../.env.local`;
const TREASURY = new PublicKey("EZkoXXZ5HEWdKwfv7wua7k6Dqv8aQxxHWNakq2gG2Qpb");
const ATELIER_MINT = new PublicKey("7newJUjH7LGsGPDfEq83gxxy2d1q39A84SeUKha8pump");
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const EXPECTED_V1_POOL = "H4XFUj2kSVq5r48LAbJtaS5BVBzCVMS5S2z8GPSPFknm";
const POSITION_DISCRIMINATOR = Buffer.from([78, 165, 30, 111, 171, 125, 11, 220]);

function envVal(name: string): string {
  const line = fs
    .readFileSync(ENV_PATH, "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} not found in .env.local`);
  return line.slice(name.length + 1).replace(/^"|"$/g, "");
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

  // Legacy derivation: no pool_id in the seeds.
  const pda = (seeds: Buffer[]): PublicKey =>
    PublicKey.findProgramAddressSync(seeds, program.programId)[0];
  const pool = pda([Buffer.from("pool"), ATELIER_MINT.toBuffer()]);
  assert(pool.toBase58() === EXPECTED_V1_POOL, `derived ${pool.toBase58()}, expected v1 pool`);
  const rewardVault = pda([Buffer.from("reward_vault"), pool.toBuffer()]);
  const position = pda([
    Buffer.from("position"), pool.toBuffer(), TREASURY.toBuffer(), Buffer.from([0]),
  ]);

  console.log("[1/2] verifying nobody but the treasury staked in v1...");
  const positions = await connection.getProgramAccounts(program.programId, {
    filters: [{ memcmp: { offset: 0, bytes: bs58.encode(POSITION_DISCRIMINATOR) } }],
  });
  const v1Positions = positions.filter((a) =>
    new PublicKey(a.account.data.subarray(8, 40)).equals(pool),
  );
  console.log(`positions program-wide: ${positions.length}; in v1 pool: ${v1Positions.length}`);
  for (const p of v1Positions) {
    const owner = new PublicKey(p.account.data.subarray(40, 72));
    console.log(`  v1 position ${p.pubkey.toBase58()} owner ${owner.toBase58()}`);
    assert(
      owner.equals(TREASURY),
      `THIRD-PARTY POSITION FOUND (${owner.toBase58()}) -- do NOT upgrade until resolved`,
    );
  }

  console.log("\n[2/2] claiming accrued v1 USDC drip to the treasury...");
  const usdcAta = getAssociatedTokenAddressSync(USDC_MINT, TREASURY, false, TOKEN_PROGRAM_ID);
  const before = (await getAccount(connection, usdcAta, "confirmed")).amount;
  const claimSig = await program.methods
    .claim()
    .accountsPartial({
      owner: TREASURY,
      pool,
      position,
      rewardMint: USDC_MINT,
      rewardVault,
      ownerRewardAta: usdcAta,
      rewardTokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc({ commitment: "confirmed" });
  const after = (await getAccount(connection, usdcAta, "confirmed")).amount;
  console.log("claim tx:", claimSig);
  console.log(`recovered ${after - before} micro-USDC`);
  console.log(
    "\nV1 RETIREMENT CHECK PASS -- safe to upgrade. Written off: the 1,000 " +
    "$ATELIER principal (15d-locked) and the unvested remainder of the 1 USDC tranche.",
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : err);
    process.exit(1);
  },
);
