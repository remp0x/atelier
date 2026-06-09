// Public Base (Ethereum L2) chain constants. Safe to import from client code --
// these contain no secrets. Server-only logic (private keys, RPC signing) lives
// in base-server.ts / base-payout.ts, which are guarded with `server-only`.

export const USDC_BASE_ADDRESS: `0x${string}` = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const USDC_BASE_DECIMALS = 6;
export const BASE_CHAIN_ID = 8453;

export const ERC20_USDC_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const;
