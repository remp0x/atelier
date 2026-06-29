use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::constants::*;
use crate::errors::StakingError;
use crate::events::Claimed;
use crate::state::{StakePool, StakePosition};

#[derive(Accounts)]
pub struct Claim<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [POOL_SEED, pool.staked_mint.as_ref()],
        bump = pool.bump,
        has_one = reward_mint,
    )]
    pub pool: Account<'info, StakePool>,

    #[account(mut, has_one = owner, has_one = pool)]
    pub position: Account<'info, StakePosition>,

    pub reward_mint: InterfaceAccount<'info, Mint>,

    #[account(mut, address = pool.reward_vault)]
    pub reward_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = reward_mint,
        token::authority = owner,
        token::token_program = reward_token_program,
    )]
    pub owner_reward_ata: InterfaceAccount<'info, TokenAccount>,

    pub reward_token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<Claim>) -> Result<()> {
    let reward_vault_amount = ctx.accounts.reward_vault.amount;
    ctx.accounts.pool.sync_rewards(reward_vault_amount)?;
    let acc = ctx.accounts.pool.acc_reward_per_weight;
    ctx.accounts.position.settle(acc)?;

    let payout = ctx.accounts.position.pending_reward;
    require!(payout > 0, StakingError::NothingToClaim);

    // Pay out, signed by the pool PDA (the vault authority).
    let staked_mint_key = ctx.accounts.pool.staked_mint;
    let pool_bump_arr = [ctx.accounts.pool.bump];
    let seeds: &[&[u8]] = &[POOL_SEED, staked_mint_key.as_ref(), &pool_bump_arr];
    let signer_seeds: &[&[&[u8]]] = &[seeds];
    let decimals = ctx.accounts.reward_mint.decimals;
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.reward_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.reward_vault.to_account_info(),
                mint: ctx.accounts.reward_mint.to_account_info(),
                to: ctx.accounts.owner_reward_ata.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            signer_seeds,
        ),
        payout,
        decimals,
    )?;

    ctx.accounts.position.pending_reward = 0;

    {
        let pool = &mut ctx.accounts.pool;
        pool.total_rewards_claimed = pool
            .total_rewards_claimed
            .checked_add(payout)
            .ok_or(StakingError::MathOverflow)?;
        // Keep last_balance in lockstep with the outflow so the next sync's
        // delta computation stays correct.
        pool.reward_vault_last_balance = pool
            .reward_vault_last_balance
            .checked_sub(payout)
            .ok_or(StakingError::MathOverflow)?;
    }

    emit!(Claimed {
        pool: ctx.accounts.pool.key(),
        owner: ctx.accounts.owner.key(),
        amount: payout,
    });
    Ok(())
}
