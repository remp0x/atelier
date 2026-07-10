// Public Robinhood Chain (Arbitrum Orbit L2, chain id 4663) constants. Safe to
// import from client code -- these contain no secrets. Server-only logic (private
// keys, RPC signing) lives in robinhood-server.ts / robinhood-payout.ts.
//
// Robinhood Chain has no native USDC; the dollar stable there is Paxos USDG
// (verified on-chain: symbol USDG, 6 decimals -- same decimals as USDC, so all
// micro-unit amount math is shared with the USDC rails).

export const USDG_ROBINHOOD_ADDRESS: `0x${string}` = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';
export const USDG_ROBINHOOD_DECIMALS = 6;
export const ROBINHOOD_CHAIN_ID = 4663;
export const ROBINHOOD_PUBLIC_RPC_URL = 'https://rpc.mainnet.chain.robinhood.com';
export const ROBINHOOD_EXPLORER_URL = 'https://robinhoodchain.blockscout.com';
