use anchor_lang::prelude::*;

#[error_code]
pub enum StakingError {
    #[msg("Pool is paused for new stakes")]
    Paused,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Tier index out of range or mismatched")]
    InvalidTierIndex,
    #[msg("Invalid tier configuration")]
    InvalidTierConfig,
    #[msg("Position is still locked")]
    Locked,
    #[msg("Insufficient staked balance")]
    InsufficientStake,
    #[msg("Nothing to claim")]
    NothingToClaim,
    #[msg("Staked mint carries a disallowed Token-2022 extension")]
    UnsafeMintExtension,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Reward vault balance is inconsistent with the ledger")]
    RewardVaultBalanceMismatch,
    #[msg("Only the program upgrade authority may initialize a pool")]
    Unauthorized,
    #[msg("Reward duration must be greater than zero and within bounds")]
    InvalidRewardDuration,
}
