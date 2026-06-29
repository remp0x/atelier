use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::{
    extension::{BaseStateWithExtensions, ExtensionType, StateWithExtensions},
    state::Mint as MintState,
};

use crate::errors::StakingError;

pub mod claim;
pub mod crank;
pub mod initialize_pool;
pub mod set_paused;
pub mod stake;
pub mod unstake;

pub use claim::Claim;
pub use crank::CrankSync;
pub use initialize_pool::InitializePool;
pub use set_paused::SetPaused;
pub use stake::Stake;
pub use unstake::Unstake;

/// Reject staked mints whose Token-2022 extensions would break the program's
/// accounting or custody assumptions:
/// - TransferFee: amount received != amount sent -> vault would go insolvent.
/// - TransferHook: arbitrary CPI on every transfer -> reentrancy surface.
/// - PermanentDelegate: a third party could move staked tokens out of the vault.
/// - ConfidentialTransfer: balances are not plaintext-readable.
/// - DefaultAccountState / NonTransferable / MintCloseAuthority: can freeze or
///   brick the vault.
///
/// Legacy SPL Token mints have no extensions and pass trivially.
pub fn assert_safe_staked_mint(mint_ai: &AccountInfo) -> Result<()> {
    if mint_ai.owner == &anchor_spl::token::ID {
        return Ok(());
    }
    let data = mint_ai.try_borrow_data()?;
    let state = StateWithExtensions::<MintState>::unpack(&data)
        .map_err(|_| error!(StakingError::UnsafeMintExtension))?;
    let extensions = state
        .get_extension_types()
        .map_err(|_| error!(StakingError::UnsafeMintExtension))?;
    for ext in extensions {
        match ext {
            ExtensionType::TransferFeeConfig
            | ExtensionType::TransferHook
            | ExtensionType::PermanentDelegate
            | ExtensionType::ConfidentialTransferMint
            | ExtensionType::DefaultAccountState
            | ExtensionType::NonTransferable
            | ExtensionType::MintCloseAuthority => {
                return err!(StakingError::UnsafeMintExtension);
            }
            _ => {}
        }
    }
    Ok(())
}
