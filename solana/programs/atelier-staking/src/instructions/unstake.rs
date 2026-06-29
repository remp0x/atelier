use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::constants::*;
use crate::errors::StakingError;
use crate::events::Unstaked;
use crate::state::{StakePool, StakePosition};

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [POOL_SEED, pool.staked_mint.as_ref()],
        bump = pool.bump,
        has_one = staked_mint,
    )]
    pub pool: Account<'info, StakePool>,

    #[account(mut, has_one = owner, has_one = pool)]
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
}

pub fn handler(ctx: Context<Unstake>, amount: u64) -> Result<()> {
    require!(amount > 0, StakingError::ZeroAmount);
    let now = Clock::get()?.unix_timestamp;
    require!(
        amount <= ctx.accounts.position.amount,
        StakingError::InsufficientStake
    );
    require!(
        now >= ctx.accounts.position.lock_until,
        StakingError::Locked
    );

    // Settle rewards against the old weight before reducing it.
    let reward_vault_amount = ctx.accounts.reward_vault.amount;
    ctx.accounts.pool.sync_rewards(reward_vault_amount)?;
    let acc = ctx.accounts.pool.acc_reward_per_weight;
    ctx.accounts.position.settle(acc)?;

    // Return principal, signed by the pool PDA (the vault authority).
    let staked_mint_key = ctx.accounts.pool.staked_mint;
    let pool_bump_arr = [ctx.accounts.pool.bump];
    let seeds: &[&[u8]] = &[POOL_SEED, staked_mint_key.as_ref(), &pool_bump_arr];
    let signer_seeds: &[&[&[u8]]] = &[seeds];
    let decimals = ctx.accounts.staked_mint.decimals;
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.staked_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.staked_vault.to_account_info(),
                mint: ctx.accounts.staked_mint.to_account_info(),
                to: ctx.accounts.owner_staked_ata.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
        decimals,
    )?;

    // Update weights and pool totals.
    let tier_index = ctx.accounts.position.tier_index;
    let new_amount = ctx
        .accounts
        .position
        .amount
        .checked_sub(amount)
        .ok_or(StakingError::MathOverflow)?;
    let old_weight = ctx.accounts.position.weight;
    let new_weight = ctx.accounts.pool.weight_for(new_amount, tier_index)?;

    ctx.accounts.position.amount = new_amount;
    ctx.accounts.position.weight = new_weight;

    {
        let pool = &mut ctx.accounts.pool;
        pool.total_weight = pool
            .total_weight
            .checked_sub(old_weight)
            .ok_or(StakingError::MathOverflow)?
            .checked_add(new_weight)
            .ok_or(StakingError::MathOverflow)?;
        pool.total_staked = pool
            .total_staked
            .checked_sub(amount)
            .ok_or(StakingError::MathOverflow)?;
    }

    let acc_final = ctx.accounts.pool.acc_reward_per_weight;
    ctx.accounts.position.reset_reward_debt(acc_final)?;

    emit!(Unstaked {
        pool: ctx.accounts.pool.key(),
        owner: ctx.accounts.owner.key(),
        tier_index,
        amount,
        position_amount: ctx.accounts.position.amount,
    });
    Ok(())
}
