/**
 * Initialize a staking pool. Run AFTER `anchor deploy`, signed by the program's
 * upgrade authority (the deploying wallet) -- `initialize_pool` is gated to it.
 *
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   STAKED_MINT=<mint> REWARD_MINT=<usdc> \
 *     yarn init-pool
 *
 * Token programs (legacy SPL vs Token-2022) are auto-detected per mint. Tiers
 * default to flexible 1x / 90d 4x / 180d 8x; override with TIERS_JSON (an array
 * of { durationSecs, multiplierBps }). REWARD_DURATION_SECS (the linear-drip
 * window) defaults to 7 days (604800); override to change it. Requires
 * `anchor build` artifacts (target/idl + target/types) to be present.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { AtelierStaking } from "../target/types/atelier_staking";

const BPF_LOADER_UPGRADEABLE = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);
const DAY = 24 * 60 * 60;
const DEFAULT_TIERS = [
  { durationSecs: 0, multiplierBps: 10_000 },
  { durationSecs: 90 * DAY, multiplierBps: 40_000 },
  { durationSecs: 180 * DAY, multiplierBps: 80_000 },
];

function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

async function tokenProgramFor(
  connection: anchor.web3.Connection,
  mint: PublicKey,
): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint);
  if (!info) throw new Error(`Mint ${mint.toBase58()} not found on this cluster`);
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  if (info.owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID;
  throw new Error(
    `Mint ${mint.toBase58()} is not owned by a token program (owner ${info.owner.toBase58()})`,
  );
}

async function upgradeAuthority(
  connection: anchor.web3.Connection,
  programData: PublicKey,
): Promise<PublicKey | null> {
  const info = await connection.getAccountInfo(programData);
  if (!info) return null;
  // UpgradeableLoaderState::ProgramData = enum tag(4) + slot(8) + Option<Pubkey>.
  const hasAuthority = info.data[12] === 1;
  return hasAuthority ? new PublicKey(info.data.subarray(13, 45)) : null;
}

async function main(): Promise<void> {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.atelierStaking as Program<AtelierStaking>;
  const connection = provider.connection;
  const admin = provider.wallet.publicKey;

  const stakedMint = new PublicKey(reqEnv("STAKED_MINT"));
  const rewardMint = new PublicKey(reqEnv("REWARD_MINT"));
  const rewardDurationSecs = Number(process.env.REWARD_DURATION_SECS ?? 7 * DAY);
  if (!Number.isInteger(rewardDurationSecs) || rewardDurationSecs <= 0) {
    throw new Error("REWARD_DURATION_SECS must be a positive integer (seconds)");
  }
  const tiersInput = process.env.TIERS_JSON
    ? (JSON.parse(process.env.TIERS_JSON) as typeof DEFAULT_TIERS)
    : DEFAULT_TIERS;
  const tiers = tiersInput.map((t) => ({
    durationSecs: new BN(t.durationSecs),
    multiplierBps: new BN(t.multiplierBps),
  }));

  const [pool] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), stakedMint.toBuffer()],
    program.programId,
  );
  const [stakedVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("staked_vault"), pool.toBuffer()],
    program.programId,
  );
  const [rewardVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("reward_vault"), pool.toBuffer()],
    program.programId,
  );
  const [programData] = PublicKey.findProgramAddressSync(
    [program.programId.toBuffer()],
    BPF_LOADER_UPGRADEABLE,
  );

  const stakedTokenProgram = await tokenProgramFor(connection, stakedMint);
  const rewardTokenProgram = await tokenProgramFor(connection, rewardMint);

  const authority = await upgradeAuthority(connection, programData);
  console.log("program:        ", program.programId.toBase58());
  console.log("admin (wallet): ", admin.toBase58());
  console.log("upgrade auth:   ", authority ? authority.toBase58() : "(none / immutable)");
  console.log("pool:           ", pool.toBase58());
  console.log("staked mint:    ", stakedMint.toBase58(), `(${stakedTokenProgram.toBase58()})`);
  console.log("reward mint:    ", rewardMint.toBase58(), `(${rewardTokenProgram.toBase58()})`);
  console.log("reward duration:", rewardDurationSecs, "secs");

  if (!authority) {
    throw new Error(
      "Program has no upgrade authority (immutable) -- initialize_pool can never succeed. Init before making the program immutable.",
    );
  }
  if (!authority.equals(admin)) {
    throw new Error(
      `Wallet ${admin.toBase58()} is not the upgrade authority ${authority.toBase58()}; initialize_pool would revert with Unauthorized.`,
    );
  }
  if (await connection.getAccountInfo(pool)) {
    console.log("Pool already initialized -- nothing to do.");
    return;
  }

  const sig = await program.methods
    .initializePool(tiers as never, new BN(rewardDurationSecs))
    .accountsPartial({
      admin,
      program: program.programId,
      programData,
      stakedMint,
      rewardMint,
      pool,
      stakedVault,
      rewardVault,
      stakedTokenProgram,
      rewardTokenProgram,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  console.log("\ninitialize_pool tx:", sig);
  const acct = await program.account.stakePool.fetch(pool);
  console.log(
    `pool initialized: ${acct.tiers.length} tiers, reward_duration ${acct.rewardDuration.toString()}s, paused=${acct.paused}`,
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
