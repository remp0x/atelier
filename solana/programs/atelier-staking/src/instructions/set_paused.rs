use anchor_lang::prelude::*;

use crate::constants::*;
use crate::events::PausedSet;
use crate::state::StakePool;

/// Admin-only kill switch for NEW stakes. By design it cannot block `unstake`
/// or `claim` -- user funds are always withdrawable.
#[derive(Accounts)]
pub struct SetPaused<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [POOL_SEED, pool.staked_mint.as_ref()],
        bump = pool.bump,
        has_one = admin,
    )]
    pub pool: Account<'info, StakePool>,
}

pub fn handler(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
    ctx.accounts.pool.paused = paused;
    emit!(PausedSet {
        pool: ctx.accounts.pool.key(),
        paused,
    });
    Ok(())
}
