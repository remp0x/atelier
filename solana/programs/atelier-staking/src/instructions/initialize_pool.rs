use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::errors::StakingError;
use crate::events::PoolInitialized;
use crate::instructions::assert_safe_mint;
use crate::program::AtelierStaking;
use crate::state::{StakePool, Tier};

#[derive(Accounts)]
#[instruction(pool_id: u8)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// This program, used to reach its ProgramData. Closes the init front-run
    /// vector: the pool PDA is deterministic per mint, so without this gate
    /// anyone could create the canonical pool first and seize `admin` forever.
    #[account(
        constraint = program.programdata_address()? == Some(program_data.key())
            @ StakingError::Unauthorized,
    )]
    pub program: Program<'info, AtelierStaking>,

    /// Only the program's upgrade authority may initialize a pool.
    #[account(
        constraint = program_data.upgrade_authority_address == Some(admin.key())
            @ StakingError::Unauthorized,
    )]
    pub program_data: Account<'info, ProgramData>,

    pub staked_mint: InterfaceAccount<'info, Mint>,
    pub reward_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = admin,
        space = 8 + StakePool::INIT_SPACE,
        seeds = [POOL_SEED, staked_mint.key().as_ref(), &[pool_id]],
        bump,
    )]
    pub pool: Account<'info, StakePool>,

    #[account(
        init,
        payer = admin,
        seeds = [STAKED_VAULT_SEED, pool.key().as_ref()],
        bump,
        token::mint = staked_mint,
        token::authority = pool,
        token::token_program = staked_token_program,
    )]
    pub staked_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = admin,
        seeds = [REWARD_VAULT_SEED, pool.key().as_ref()],
        bump,
        token::mint = reward_mint,
        token::authority = pool,
        token::token_program = reward_token_program,
    )]
    pub reward_vault: InterfaceAccount<'info, TokenAccount>,

    pub staked_token_program: Interface<'info, TokenInterface>,
    pub reward_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<InitializePool>,
    pool_id: u8,
    tiers: [Tier; TIER_COUNT],
    reward_duration_secs: i64,
    funder: Pubkey,
) -> Result<()> {
    require!(
        reward_duration_secs >= MIN_REWARD_DURATION_SECS
            && reward_duration_secs <= MAX_REWARD_DURATION_SECS,
        StakingError::InvalidRewardDuration
    );
    for tier in tiers.iter() {
        require!(
            tier.multiplier_bps >= MIN_MULTIPLIER_BPS,
            StakingError::InvalidTierConfig
        );
        require!(
            tier.multiplier_bps <= MAX_MULTIPLIER_BPS,
            StakingError::InvalidTierConfig
        );
        require!(tier.duration_secs >= 0, StakingError::InvalidTierConfig);
        require!(
            tier.duration_secs <= MAX_TIER_DURATION_SECS,
            StakingError::InvalidTierConfig
        );
    }

    assert_safe_mint(&ctx.accounts.staked_mint.to_account_info())?;
    assert_safe_mint(&ctx.accounts.reward_mint.to_account_info())?;

    let pool = &mut ctx.accounts.pool;
    pool.admin = ctx.accounts.admin.key();
    pool.pool_id = pool_id;
    pool.funder = if funder == Pubkey::default() {
        ctx.accounts.admin.key()
    } else {
        funder
    };
    pool.staked_mint = ctx.accounts.staked_mint.key();
    pool.reward_mint = ctx.accounts.reward_mint.key();
    pool.staked_vault = ctx.accounts.staked_vault.key();
    pool.reward_vault = ctx.accounts.reward_vault.key();
    pool.tiers = tiers;
    pool.total_staked = 0;
    pool.total_weight = 0;
    pool.acc_reward_per_weight = 0;
    let now = Clock::get()?.unix_timestamp;
    pool.reward_rate = 0;
    pool.period_finish = now;
    pool.last_update_time = now;
    pool.reward_duration = reward_duration_secs;
    pool.reward_vault_last_balance = ctx.accounts.reward_vault.amount;
    pool.total_rewards_distributed = 0;
    pool.total_rewards_claimed = 0;
    pool.paused = false;
    pool.bump = ctx.bumps.pool;
    pool.staked_vault_bump = ctx.bumps.staked_vault;
    pool.reward_vault_bump = ctx.bumps.reward_vault;

    emit!(PoolInitialized {
        pool: pool.key(),
        admin: pool.admin,
        funder: pool.funder,
        staked_mint: pool.staked_mint,
        reward_mint: pool.reward_mint,
    });
    Ok(())
}
