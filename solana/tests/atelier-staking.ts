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

  // Test fixture: tier 0 stays zero-duration on purpose (exercises immediate
  // unstake + sole-staker drip); production tiers are 15/30/60/180 days.
  const TIERS = [
    { durationSecs: new BN(0), multiplierBps: new BN(10_000) },
    { durationSecs: new BN(30 * 24 * 60 * 60), multiplierBps: new BN(20_000) },
    { durationSecs: new BN(60 * 24 * 60 * 60), multiplierBps: new BN(40_000) },
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

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Rewards drip linearly over reward_duration. The on-chain floor is 60s
  // (MIN_REWARD_DURATION_SECS), so tests use a 60s window and sleep past it to
  // collect the fully-dripped amount. The provider wallet is both admin and
  // funder here.
  async function setupPool(rewardDurationSecs = 60, poolId = 0): Promise<PoolCtx> {
    const stakedMint = await createMint(
      connection, payer, payer.publicKey, null, 6, Keypair.generate(), undefined, TOKEN_2022_PROGRAM_ID,
    );
    const rewardMint = await createMint(
      connection, payer, payer.publicKey, null, 6, Keypair.generate(), undefined, TOKEN_PROGRAM_ID,
    );
    const pool = pda([POOL_SEED, stakedMint.toBuffer(), Buffer.from([poolId])]);
    const stakedVault = pda([STAKED_VAULT_SEED, pool.toBuffer()]);
    const rewardVault = pda([REWARD_VAULT_SEED, pool.toBuffer()]);

    await program.methods
      .initializePool(poolId, TIERS as never, new BN(rewardDurationSecs), payer.publicKey)
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
    await program.methods
      .crankSync()
      .accountsPartial({ funder: payer.publicKey, pool: ctx.pool, rewardVault: ctx.rewardVault })
      .rpc();
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
      .rpc({ commitment: "confirmed", skipPreflight: true });
    const acct = await getAccount(connection, rewardAta.address, "confirmed");
    return acct.amount;
  }

  it("initializes a pool with four tiers", async () => {
    const ctx = await setupPool();
    const acct = await program.account.stakePool.fetch(ctx.pool);
    assert.equal(acct.tiers.length, 4);
    assert.equal(acct.tiers[3].multiplierBps.toNumber(), 80_000);
    assert.equal(acct.totalStaked.toNumber(), 0);
    assert.equal(acct.rewardDuration.toNumber(), 60);
    assert.isTrue(acct.funder.equals(payer.publicKey));
    assert.isFalse(acct.paused);
  });

  it("allows a second pool for the same mint under a different pool_id", async () => {
    const ctx = await setupPool(60, 0);
    const rewardMint2 = await createMint(
      connection, payer, payer.publicKey, null, 9, Keypair.generate(), undefined, TOKEN_PROGRAM_ID,
    );
    const pool2 = pda([POOL_SEED, ctx.stakedMint.toBuffer(), Buffer.from([1])]);
    const stakedVault2 = pda([STAKED_VAULT_SEED, pool2.toBuffer()]);
    const rewardVault2 = pda([REWARD_VAULT_SEED, pool2.toBuffer()]);
    await program.methods
      .initializePool(1, TIERS as never, new BN(60), payer.publicKey)
      .accountsPartial({
        admin: payer.publicKey,
        program: program.programId,
        programData: programDataPda,
        stakedMint: ctx.stakedMint,
        rewardMint: rewardMint2,
        pool: pool2,
        stakedVault: stakedVault2,
        rewardVault: rewardVault2,
        stakedTokenProgram: TOKEN_2022_PROGRAM_ID,
        rewardTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const first = await program.account.stakePool.fetch(ctx.pool);
    const second = await program.account.stakePool.fetch(pool2);
    assert.equal(first.poolId, 0);
    assert.equal(second.poolId, 1);
    assert.isFalse(ctx.pool.equals(pool2));

    // Staking into the second pool leaves the first untouched.
    const ctx2: PoolCtx = {
      stakedMint: ctx.stakedMint,
      rewardMint: rewardMint2,
      pool: pool2,
      stakedVault: stakedVault2,
      rewardVault: rewardVault2,
    };
    const a = await makeStaker(ctx2, 1_000_000);
    await stake(ctx2, a, 0, 1_000_000);
    const firstAfter = await program.account.stakePool.fetch(ctx.pool);
    const secondAfter = await program.account.stakePool.fetch(pool2);
    assert.equal(firstAfter.totalStaked.toNumber(), 0);
    assert.equal(secondAfter.totalStaked.toNumber(), 1_000_000);
  });

  it("sole flexible staker collects ~all funded rewards (after the drip)", async () => {
    const ctx = await setupPool(60);
    const a = await makeStaker(ctx, 1_000_000);
    await stake(ctx, a, 0, 1_000_000);
    await fundRewards(ctx, 500_000); // starts a 60s linear drip
    await sleep(66_000); // wait past period_finish so the full tranche has dripped
    const got = await claim(ctx, a, 0);
    // sole staker -> ~100% (allow rounding dust)
    assert.isTrue(got >= 499_999n && got <= 500_000n, `got ${got}`);
  });

  it("splits rewards by weighted stake across tiers", async () => {
    const ctx = await setupPool(60);
    const a = await makeStaker(ctx, 1_000_000); // zero-duration 1x
    const b = await makeStaker(ctx, 1_000_000); // 180d 8x
    await stake(ctx, a, 0, 1_000_000);
    await stake(ctx, b, 3, 1_000_000);
    // weights: a=1_000_000, b=8_000_000, total=9_000_000
    await fundRewards(ctx, 9_000_000);
    // Claim after period_finish so both see the fully-dripped tranche: the 1:8
    // split is then exact (up to floor dust) regardless of inter-claim latency.
    // (A mid-drip ratio assertion is timing-sensitive: each claim lands ~1s
    // apart on localnet, which skews the ratio by t_b/t_a.)
    await sleep(66_000);
    const aGot = await claim(ctx, a, 0);
    const bGot = await claim(ctx, b, 3);
    assert.isTrue(aGot >= 999_000n && aGot <= 1_000_000n, `a ${aGot}`);
    const ratio = Number(bGot) / Number(aGot);
    assert.isTrue(ratio > 7.99 && ratio < 8.01, `ratio ${ratio} (a ${aGot} b ${bGot})`);
  });

  it("drips rewards over time, not instantly (JIT / monopoly resistance)", async () => {
    const ctx = await setupPool(60); // 60s drip window
    const a = await makeStaker(ctx, 1_000_000);
    await stake(ctx, a, 0, 1_000_000);
    await fundRewards(ctx, 1_000_000); // funds a 60s drip; NOT claimable all at once
    await sleep(6000);
    const afterFirst = await claim(ctx, a, 0); // cumulative; only a fraction dripped
    assert.isTrue(
      afterFirst > 0n && afterFirst < 700_000n,
      `expected a partial drip, got ${afterFirst}`,
    );
    await sleep(62_000); // now past period_finish -> remainder dripped
    const afterSecond = await claim(ctx, a, 0); // cumulative full
    assert.isTrue(
      afterSecond >= 990_000n && afterSecond <= 1_000_000n,
      `expected ~full after the window, got ${afterSecond}`,
    );
  });

  it("blocks unstake while locked", async () => {
    const ctx = await setupPool();
    const b = await makeStaker(ctx, 1_000_000);
    await stake(ctx, b, 2, 1_000_000); // 60d lock
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
    const pool = pda([POOL_SEED, mintKp.publicKey.toBuffer(), Buffer.from([0])]);
    const stakedVault = pda([STAKED_VAULT_SEED, pool.toBuffer()]);
    const rewardVault = pda([REWARD_VAULT_SEED, pool.toBuffer()]);

    let failed = false;
    try {
      await program.methods
        .initializePool(0, TIERS as never, new BN(60), payer.publicKey)
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
    const pool = pda([POOL_SEED, stakedMint.toBuffer(), Buffer.from([0])]);
    const stakedVault = pda([STAKED_VAULT_SEED, pool.toBuffer()]);
    const rewardVault = pda([REWARD_VAULT_SEED, pool.toBuffer()]);

    let failed = false;
    try {
      await program.methods
        .initializePool(0, TIERS as never, new BN(60), payer.publicKey)
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

  it("rejects a reward duration below the on-chain minimum", async () => {
    const stakedMint = await createMint(
      connection, payer, payer.publicKey, null, 6, Keypair.generate(), undefined, TOKEN_2022_PROGRAM_ID,
    );
    const rewardMint = await createMint(
      connection, payer, payer.publicKey, null, 6, Keypair.generate(), undefined, TOKEN_PROGRAM_ID,
    );
    const pool = pda([POOL_SEED, stakedMint.toBuffer(), Buffer.from([0])]);
    const stakedVault = pda([STAKED_VAULT_SEED, pool.toBuffer()]);
    const rewardVault = pda([REWARD_VAULT_SEED, pool.toBuffer()]);

    let failed = false;
    try {
      await program.methods
        .initializePool(0, TIERS as never, new BN(30), payer.publicKey) // < 60s floor
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
    } catch (err) {
      failed = true;
      assert.include(`${err}`, "InvalidRewardDuration");
    }
    assert.isTrue(failed, "expected init with a sub-minimum duration to fail");
  });

  it("rejects crank_sync from a non-funder", async () => {
    const ctx = await setupPool(60);
    const a = await makeStaker(ctx, 1_000_000);
    await stake(ctx, a, 0, 1_000_000);
    // Put USDC in the vault, then have a non-funder try to notify it.
    await mintTo(connection, payer, ctx.rewardMint, ctx.rewardVault, payer, 100_000, [], undefined, TOKEN_PROGRAM_ID);
    const attacker = Keypair.generate();
    await airdrop(attacker.publicKey);

    let failed = false;
    try {
      await program.methods
        .crankSync()
        .accountsPartial({ funder: attacker.publicKey, pool: ctx.pool, rewardVault: ctx.rewardVault })
        .signers([attacker])
        .rpc();
    } catch (err) {
      failed = true;
      assert.include(`${err}`, "Unauthorized");
    }
    assert.isTrue(failed, "expected crank by a non-funder to fail");
  });
});
