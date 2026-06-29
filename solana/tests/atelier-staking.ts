import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { AtelierStaking } from "../target/types/atelier_staking";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  getMintLen,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
} from "@solana/spl-token";
import { assert } from "chai";

// Workspace key is the camelCase program name (atelier_staking -> atelierStaking).
describe("atelier-staking", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.atelierStaking as Program<AtelierStaking>;
  const connection = provider.connection;
  const payer = (provider.wallet as anchor.Wallet).payer;

  // The deploying wallet (provider) is the program's upgrade authority on
  // localnet; initialize_pool is gated to it (see MED-1 fix).
  const BPF_LOADER_UPGRADEABLE = new PublicKey(
    "BPFLoaderUpgradeab1e11111111111111111111111",
  );
  const programDataPda = PublicKey.findProgramAddressSync(
    [program.programId.toBuffer()],
    BPF_LOADER_UPGRADEABLE,
  )[0];

  const POOL_SEED = Buffer.from("pool");
  const STAKED_VAULT_SEED = Buffer.from("staked_vault");
  const REWARD_VAULT_SEED = Buffer.from("reward_vault");
  const POSITION_SEED = Buffer.from("position");

  const TIERS = [
    { durationSecs: new BN(0), multiplierBps: new BN(10_000) },
    { durationSecs: new BN(90 * 24 * 60 * 60), multiplierBps: new BN(40_000) },
    { durationSecs: new BN(180 * 24 * 60 * 60), multiplierBps: new BN(80_000) },
  ];

  interface PoolCtx {
    stakedMint: PublicKey;
    rewardMint: PublicKey;
    pool: PublicKey;
    stakedVault: PublicKey;
    rewardVault: PublicKey;
  }

  function pda(seeds: Buffer[]): PublicKey {
    return PublicKey.findProgramAddressSync(seeds, program.programId)[0];
  }

  function positionPda(pool: PublicKey, owner: PublicKey, tier: number): PublicKey {
    return pda([POSITION_SEED, pool.toBuffer(), owner.toBuffer(), Buffer.from([tier])]);
  }

  async function airdrop(pubkey: PublicKey): Promise<void> {
    const sig = await connection.requestAirdrop(pubkey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
  }

  async function setupPool(): Promise<PoolCtx> {
    const stakedMint = await createMint(
      connection, payer, payer.publicKey, null, 6, Keypair.generate(), undefined, TOKEN_2022_PROGRAM_ID,
    );
    const rewardMint = await createMint(
      connection, payer, payer.publicKey, null, 6, Keypair.generate(), undefined, TOKEN_PROGRAM_ID,
    );
    const pool = pda([POOL_SEED, stakedMint.toBuffer()]);
    const stakedVault = pda([STAKED_VAULT_SEED, pool.toBuffer()]);
    const rewardVault = pda([REWARD_VAULT_SEED, pool.toBuffer()]);

    await program.methods
      .initializePool(TIERS as never)
      .accountsPartial({
        admin: payer.publicKey,
        program: program.programId,
        programData: programDataPda,
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

    return { stakedMint, rewardMint, pool, stakedVault, rewardVault };
  }

  async function makeStaker(ctx: PoolCtx, amount: number): Promise<{ kp: Keypair; ata: PublicKey }> {
    const kp = Keypair.generate();
    await airdrop(kp.publicKey);
    const ata = await getOrCreateAssociatedTokenAccount(
      connection, payer, ctx.stakedMint, kp.publicKey, false, undefined, undefined, TOKEN_2022_PROGRAM_ID,
    );
    await mintTo(
      connection, payer, ctx.stakedMint, ata.address, payer, amount, [], undefined, TOKEN_2022_PROGRAM_ID,
    );
    return { kp, ata: ata.address };
  }

  async function stake(ctx: PoolCtx, staker: { kp: Keypair; ata: PublicKey }, tier: number, amount: number): Promise<void> {
    await program.methods
      .stake(tier, new BN(amount))
      .accountsPartial({
        owner: staker.kp.publicKey,
        pool: ctx.pool,
        position: positionPda(ctx.pool, staker.kp.publicKey, tier),
        stakedMint: ctx.stakedMint,
        stakedVault: ctx.stakedVault,
        ownerStakedAta: staker.ata,
        rewardVault: ctx.rewardVault,
        stakedTokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([staker.kp])
      .rpc();
  }

  async function fundRewards(ctx: PoolCtx, usdc: number): Promise<void> {
    await mintTo(connection, payer, ctx.rewardMint, ctx.rewardVault, payer, usdc, [], undefined, TOKEN_PROGRAM_ID);
    await program.methods.crankSync().accountsPartial({ pool: ctx.pool, rewardVault: ctx.rewardVault }).rpc();
  }

  async function claim(ctx: PoolCtx, staker: { kp: Keypair }, tier: number): Promise<bigint> {
    const rewardAta = await getOrCreateAssociatedTokenAccount(
      connection, payer, ctx.rewardMint, staker.kp.publicKey, false, undefined, undefined, TOKEN_PROGRAM_ID,
    );
    await program.methods
      .claim()
      .accountsPartial({
        owner: staker.kp.publicKey,
        pool: ctx.pool,
        position: positionPda(ctx.pool, staker.kp.publicKey, tier),
        rewardMint: ctx.rewardMint,
        rewardVault: ctx.rewardVault,
        ownerRewardAta: rewardAta.address,
        rewardTokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([staker.kp])
      .rpc();
    const acct = await getAccount(connection, rewardAta.address);
    return acct.amount;
  }

  it("initializes a pool with three tiers", async () => {
    const ctx = await setupPool();
    const acct = await program.account.stakePool.fetch(ctx.pool);
    assert.equal(acct.tiers.length, 3);
    assert.equal(acct.tiers[2].multiplierBps.toNumber(), 80_000);
    assert.equal(acct.totalStaked.toNumber(), 0);
    assert.isFalse(acct.paused);
  });

  it("sole flexible staker collects ~all funded rewards", async () => {
    const ctx = await setupPool();
    const a = await makeStaker(ctx, 1_000_000);
    await stake(ctx, a, 0, 1_000_000);
    await fundRewards(ctx, 500_000);
    const got = await claim(ctx, a, 0);
    // sole staker -> ~100% (allow rounding dust)
    assert.isTrue(got >= 499_999n && got <= 500_000n, `got ${got}`);
  });

  it("splits rewards by weighted stake across tiers", async () => {
    const ctx = await setupPool();
    const a = await makeStaker(ctx, 1_000_000); // flexible 1x
    const b = await makeStaker(ctx, 1_000_000); // 180d 8x
    await stake(ctx, a, 0, 1_000_000);
    await stake(ctx, b, 2, 1_000_000);
    // weights: a=1_000_000, b=8_000_000, total=9_000_000
    await fundRewards(ctx, 9_000_000);
    const aGot = await claim(ctx, a, 0);
    const bGot = await claim(ctx, b, 2);
    // a ~ 1/9, b ~ 8/9
    assert.isTrue(aGot >= 999_000n && aGot <= 1_000_000n, `a ${aGot}`);
    assert.isTrue(bGot >= 7_999_000n && bGot <= 8_000_000n, `b ${bGot}`);
  });

  it("blocks unstake while locked", async () => {
    const ctx = await setupPool();
    const b = await makeStaker(ctx, 1_000_000);
    await stake(ctx, b, 2, 1_000_000); // 180d lock
    let failed = false;
    try {
      await program.methods
        .unstake(new BN(1_000_000))
        .accountsPartial({
          owner: b.kp.publicKey,
          pool: ctx.pool,
          position: positionPda(ctx.pool, b.kp.publicKey, 2),
          stakedMint: ctx.stakedMint,
          stakedVault: ctx.stakedVault,
          ownerStakedAta: b.ata,
          rewardVault: ctx.rewardVault,
          stakedTokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([b.kp])
        .rpc();
    } catch (err) {
      failed = true;
      assert.include(`${err}`, "Locked");
    }
    assert.isTrue(failed, "expected unstake to fail while locked");
  });

  it("lets a flexible staker unstake immediately", async () => {
    const ctx = await setupPool();
    const a = await makeStaker(ctx, 1_000_000);
    await stake(ctx, a, 0, 1_000_000);
    await program.methods
      .unstake(new BN(400_000))
      .accountsPartial({
        owner: a.kp.publicKey,
        pool: ctx.pool,
        position: positionPda(ctx.pool, a.kp.publicKey, 0),
        stakedMint: ctx.stakedMint,
        stakedVault: ctx.stakedVault,
        ownerStakedAta: a.ata,
        rewardVault: ctx.rewardVault,
        stakedTokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([a.kp])
      .rpc({ commitment: "confirmed", skipPreflight: true });
    const back = await getAccount(connection, a.ata, "confirmed", TOKEN_2022_PROGRAM_ID);
    assert.equal(back.amount.toString(), "400000");
  });

  it("rejects a staked mint with a transfer-fee extension", async () => {
    // Build a Token-2022 mint carrying TransferFeeConfig (blocklisted).
    const mintKp = Keypair.generate();
    const mintLen = getMintLen([ExtensionType.TransferFeeConfig]);
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);
    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mintKp.publicKey,
        space: mintLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeTransferFeeConfigInstruction(
        mintKp.publicKey, payer.publicKey, payer.publicKey, 100, BigInt(1_000), TOKEN_2022_PROGRAM_ID,
      ),
      createInitializeMintInstruction(mintKp.publicKey, 6, payer.publicKey, null, TOKEN_2022_PROGRAM_ID),
    );
    await anchor.web3.sendAndConfirmTransaction(connection, tx, [payer, mintKp]);

    const rewardMint = await createMint(
      connection, payer, payer.publicKey, null, 6, Keypair.generate(), undefined, TOKEN_PROGRAM_ID,
    );
    const pool = pda([POOL_SEED, mintKp.publicKey.toBuffer()]);
    const stakedVault = pda([STAKED_VAULT_SEED, pool.toBuffer()]);
    const rewardVault = pda([REWARD_VAULT_SEED, pool.toBuffer()]);

    let failed = false;
    try {
      await program.methods
        .initializePool(TIERS as never)
        .accountsPartial({
          admin: payer.publicKey,
          program: program.programId,
          programData: programDataPda,
          stakedMint: mintKp.publicKey,
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
    } catch (err) {
      failed = true;
      assert.include(`${err}`, "UnsafeMintExtension");
    }
    assert.isTrue(failed, "expected initialize to reject transfer-fee mint");
  });

  it("rejects initialize_pool from a non-upgrade-authority", async () => {
    const attacker = Keypair.generate();
    await airdrop(attacker.publicKey);
    const stakedMint = await createMint(
      connection, payer, payer.publicKey, null, 6, Keypair.generate(), undefined, TOKEN_2022_PROGRAM_ID,
    );
    const rewardMint = await createMint(
      connection, payer, payer.publicKey, null, 6, Keypair.generate(), undefined, TOKEN_PROGRAM_ID,
    );
    const pool = pda([POOL_SEED, stakedMint.toBuffer()]);
    const stakedVault = pda([STAKED_VAULT_SEED, pool.toBuffer()]);
    const rewardVault = pda([REWARD_VAULT_SEED, pool.toBuffer()]);

    let failed = false;
    try {
      await program.methods
        .initializePool(TIERS as never)
        .accountsPartial({
          admin: attacker.publicKey,
          program: program.programId,
          programData: programDataPda,
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
        .signers([attacker])
        .rpc();
    } catch (err) {
      failed = true;
      assert.include(`${err}`, "Unauthorized");
    }
    assert.isTrue(failed, "expected init by a non-upgrade-authority to fail");
  });
});
