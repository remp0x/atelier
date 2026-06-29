use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::constants::*;
use crate::events::RewardsSynced;
use crate::state::StakePool;

/// Permissionless: anyone can fold freshly-deposited USDC into the accumulator.
#[derive(Accounts)]
pub struct CrankSync<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED, pool.staked_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, StakePool>,

    #[account(address = pool.reward_vault)]
    pub reward_vault: InterfaceAccount<'info, TokenAccount>,
}

pub fn handler(ctx: Context<CrankSync>) -> Result<()> {
    let amount = ctx.accounts.reward_vault.amount;
    let new_rewards = ctx.accounts.pool.sync_rewards(amount)?;

    emit!(RewardsSynced {
        pool: ctx.accounts.pool.key(),
        new_rewards,
        acc_reward_per_weight: ctx.accounts.pool.acc_reward_per_weight,
        total_weight: ctx.accounts.pool.total_weight,
    });
    Ok(())
}
