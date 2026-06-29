use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::constants::*;
use crate::errors::StakingError;
use crate::events::Staked;
use crate::state::{StakePool, StakePosition};

#[derive(Accounts)]
#[instruction(tier_index: u8)]
pub struct Stake<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [POOL_SEED, pool.staked_mint.as_ref()],
        bump = pool.bump,
        has_one = staked_mint,
    )]
    pub pool: Account<'info, StakePool>,

    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + StakePosition::INIT_SPACE,
        seeds = [POSITION_SEED, pool.key().as_ref(), owner.key().as_ref(), &[tier_index]],
        bump,
    )]
    pub position: Account<'info, StakePosition>,

    pub staked_mint: InterfaceAccount<'info, Mint>,

    #[account(mut, address = pool.staked_vault)]
    pub staked_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = staked_mint,
        token::authority = owner,
        token::token_program = staked_token_program,
    )]
    pub owner_staked_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(address = pool.reward_vault)]
    pub reward_vault: InterfaceAccount<'info, TokenAccount>,

    pub staked_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Stake>, tier_index: u8, amount: u64) -> Result<()> {
    require!(!ctx.accounts.pool.paused, StakingError::Paused);
    require!(amount > 0, StakingError::ZeroAmount);
    require!((tier_index as usize) < TIER_COUNT, StakingError::InvalidTierIndex);

    let now = Clock::get()?.unix_timestamp;
    let reward_vault_amount = ctx.accounts.reward_vault.amount;

    // 1. Distribute any USDC that arrived before this stake, against old weight.
    ctx.accounts.pool.sync_rewards(reward_vault_amount)?;
    let acc = ctx.accounts.pool.acc_reward_per_weight;

    // 2. Identity on first stake; enforce same tier on subsequent stakes.
    {
        let pool_key = ctx.accounts.pool.key();
        let owner_key = ctx.accounts.owner.key();
        let position_bump = ctx.bumps.position;
        let position = &mut ctx.accounts.position;
        if position.owner == Pubkey::default() {
            position.pool = pool_key;
            position.owner = owner_key;
            position.tier_index = tier_index;
            position.bump = position_bump;
        } else {
            require!(position.pool == pool_key, StakingError::InvalidTierIndex);
            require!(
                position.tier_index == tier_index,
                StakingError::InvalidTierIndex
            );
        }
        // 3. Settle accrued rewards against the old weight.
        position.settle(acc)?;
    }

    // 4. Pull staked tokens in; credit the real received delta (defense even
    //    though fee-bearing mints are rejected at init).
    let pre = ctx.accounts.staked_vault.amount;
    transfer_checked(
        CpiContext::new(
            ctx.accounts.staked_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.owner_staked_ata.to_account_info(),
                mint: ctx.accounts.staked_mint.to_account_info(),
                to: ctx.accounts.staked_vault.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.staked_mint.decimals,
    )?;
    ctx.accounts.staked_vault.reload()?;
    let received = ctx
        .accounts
        .staked_vault
        .amount
        .checked_sub(pre)
        .ok_or(StakingError::MathOverflow)?;
    require!(received > 0, StakingError::ZeroAmount);

    // 5. Update weights and pool totals.
    let new_position_amount = ctx
        .accounts
        .position
        .amount
        .checked_add(received)
        .ok_or(StakingError::MathOverflow)?;
    let old_weight = ctx.accounts.position.weight;
    let new_weight = ctx.accounts.pool.weight_for(new_position_amount, tier_index)?;

    ctx.accounts.position.amount = new_position_amount;
    ctx.accounts.position.weight = new_weight;

    {
        let pool = &mut ctx.accounts.pool;
        pool.total_weight = pool
            .total_weight
            .checked_add(new_weight)
            .ok_or(StakingError::MathOverflow)?
            .checked_sub(old_weight)
            .ok_or(StakingError::MathOverflow)?;
        pool.total_staked = pool
            .total_staked
            .checked_add(received)
            .ok_or(StakingError::MathOverflow)?;
    }

    // 6. Re-lock for locked tiers (flexible tier keeps lock_until = 0).
    let duration = ctx.accounts.pool.tiers[tier_index as usize].duration_secs;
    if duration > 0 {
        let new_lock = now.checked_add(duration).ok_or(StakingError::MathOverflow)?;
        if new_lock > ctx.accounts.position.lock_until {
            ctx.accounts.position.lock_until = new_lock;
        }
    }

    // 7. Re-anchor reward debt to the new weight.
    let acc_final = ctx.accounts.pool.acc_reward_per_weight;
    ctx.accounts.position.reset_reward_debt(acc_final)?;

    emit!(Staked {
        pool: ctx.accounts.pool.key(),
        owner: ctx.accounts.owner.key(),
        tier_index,
        amount: received,
        position_amount: ctx.accounts.position.amount,
        position_weight: ctx.accounts.position.weight,
        lock_until: ctx.accounts.position.lock_until,
    });
    Ok(())
}
