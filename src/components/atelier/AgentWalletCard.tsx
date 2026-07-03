'use client';

import { useState } from 'react';
import { useFundWallet as useSolanaFundWallet, useSolanaFundingPlugin } from '@privy-io/react-auth/solana';
import { useAgentFunding } from '@/hooks/use-agent-funding';
import { useSwapUsdcToSol } from '@/hooks/use-swap-sol';

/**
 * Ambient owner-facing card for the AGENT's own wallet -- the address that pays
 * the agent's on-chain costs (token launch, SAID identity) and receives its 65%
 * creator-fee share. Gives the "agent wallet != your wallet" mental model a
 * permanent home instead of only surfacing it inside the launch form.
 */
export function AgentWalletCard({ agentId, agentName }: { agentId: string; agentName: string }) {
  useSolanaFundingPlugin();
  const { fundWallet: fundSolWallet } = useSolanaFundWallet();
  const { swapUsdcToSol } = useSwapUsdcToSol();
  const { funding, refresh } = useAgentFunding(agentId, true, 20_000);

  const [busy, setBusy] = useState<'buy' | 'swap' | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const address = funding?.deposit_address ?? null;
  if (!funding || !address) return null;

  const balanceSol = funding.balance_sol ?? 0;
  const balanceUsdc = funding.balance_usdc ?? 0;
  const launchRequired = funding.requirements.launch.required_sol;
  const readyToLaunch = funding.balance_sol !== null && balanceSol >= launchRequired;

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  async function handleBuySol() {
    if (!address) return;
    setBusy('buy');
    setError(null);
    try {
      // Floor at 0.05 SOL so the purchase clears Coinbase Onramp's $5 minimum
      // with headroom (MoonPay's floor is $20, hence the preferred provider).
      const needed = Math.max(launchRequired - balanceSol, 0.05);
      await fundSolWallet({
        address,
        options: { asset: 'native-currency', amount: needed.toFixed(4), card: { preferredProvider: 'coinbase' } },
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Funding flow failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleSwapForSol() {
    if (!address) return;
    setBusy('swap');
    setError(null);
    try {
      // Jupiter only sponsors gas for ~$10+ swaps from SOL-less wallets.
      await swapUsdcToSol({ amountUsd: 10, receiver: address });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Swap failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-4 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold font-display">Agent Wallet</h3>
        <span className="text-2xs font-mono text-neutral-500">SOLANA</span>
      </div>

      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy agent wallet address"
        title="Copy agent wallet address"
        className="cursor-pointer w-full text-left px-2.5 py-1.5 rounded-md bg-white dark:bg-black-light border border-gray-200 dark:border-neutral-800 transition-all duration-150 hover:border-atelier/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier/60"
      >
        <span className="block text-2xs font-mono uppercase tracking-wider text-neutral-500 mb-0.5">
          {copied ? 'Copied!' : 'Deposit address · click to copy'}
        </span>
        <span className="block text-2xs font-mono break-all text-neutral-700 dark:text-neutral-300">
          {address}
        </span>
      </button>

      <div className="flex items-center gap-4">
        <span className="text-xs font-mono text-neutral-400">
          <span className="text-neutral-700 dark:text-neutral-200">{balanceSol.toFixed(4)}</span> SOL
        </span>
        <span className="text-xs font-mono text-neutral-400">
          <span className="text-neutral-700 dark:text-neutral-200">${balanceUsdc.toFixed(2)}</span> USDC
        </span>
        <span className={`ml-auto text-2xs font-mono ${readyToLaunch ? 'text-green-500' : 'text-neutral-500'}`}>
          {readyToLaunch ? 'ready to launch' : `launch needs ${launchRequired} SOL`}
        </span>
      </div>

      <p className="text-2xs font-mono text-neutral-500 dark:text-neutral-400">
        {agentName}&apos;s own wallet — separate from your personal wallet. It pays the agent&apos;s
        on-chain costs (token launch, SAID identity) and receives 65% of its token creator fees.
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => { void handleBuySol(); }}
          disabled={busy !== null}
          className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 dark:border-neutral-800 text-xs font-mono text-gray-600 dark:text-neutral-300 hover:text-atelier hover:border-atelier/40 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier/60 disabled:opacity-50"
        >
          {busy === 'buy' ? 'Opening...' : 'Buy SOL (card)'}
        </button>
        <button
          type="button"
          onClick={() => { void handleSwapForSol(); }}
          disabled={busy !== null}
          className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 dark:border-neutral-800 text-xs font-mono text-gray-600 dark:text-neutral-300 hover:text-atelier hover:border-atelier/40 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier/60 disabled:opacity-50"
        >
          {busy === 'swap' ? 'Swapping...' : 'Swap $10 USDC → SOL'}
        </button>
      </div>

      {error && <p className="text-xs text-red-400 font-mono">{error}</p>}
    </div>
  );
}
