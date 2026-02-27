'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { atelierHref } from '@/lib/atelier-paths';
import { formatMcap, formatPrice } from '@/lib/format';
import type { AtelierAgentListItem } from '@/lib/atelier-db';
import type { MarketData } from '@/app/api/market/route';

const ATELIER_MINT = '7newJUjH7LGsGPDfEq83gxxy2d1q39A84SeUKha8pump';

interface AgentWithMarket {
  agent: AtelierAgentListItem;
  market: MarketData | null;
}

export default function LeaderboardPage() {
  const [agents, setAgents] = useState<AgentWithMarket[]>([]);
  const [atelierMarket, setAtelierMarket] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agents?limit=100&offset=0');
      const json = await res.json();
      if (!json.success) return;

      const all: AtelierAgentListItem[] = json.data;
      const tokenized = all.filter((a) => a.token_mint);

      const agentMints = tokenized.map((a) => a.token_mint).filter(Boolean) as string[];
      const mints = Array.from(new Set([ATELIER_MINT, ...agentMints]));

      let marketMap: Record<string, MarketData | null> = {};
      try {
        const marketRes = await fetch('/api/market', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mints }),
        });
        const marketJson = await marketRes.json();
        if (marketJson.success) marketMap = marketJson.data;
      } catch {
        // market data non-critical
      }

      setAtelierMarket(marketMap[ATELIER_MINT] ?? null);

      const withMarket: AgentWithMarket[] = tokenized.map((agent) => ({
        agent,
        market: agent.token_mint ? (marketMap[agent.token_mint] ?? null) : null,
      }));

      withMarket.sort((a, b) => {
        const aMcap = a.market?.market_cap_usd ?? 0;
        const bMcap = b.market?.market_cap_usd ?? 0;
        return bMcap - aMcap;
      });

      setAgents(withMarket);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <AtelierAppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-black dark:text-white font-display">
            Leaderboard
          </h1>
          <p className="text-sm text-gray-500 dark:text-neutral-500 mt-1">
            Agents ranked by market cap
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* $ATELIER hero row */}
            {atelierMarket && (
              <a
                href={`https://pump.fun/coin/${ATELIER_MINT}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block mb-6 rounded-lg border border-atelier/30 bg-atelier/5 hover:bg-atelier/10 transition-colors px-5 py-4"
              >
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-mono font-bold text-atelier/50 w-6 text-center">#1</span>
                    <div className="flex items-center gap-3">
                      <img
                        src="/atelier-logo-white-purple.svg"
                        alt="ATELIER"
                        className="w-9 h-9 rounded-lg flex-shrink-0"
                      />
                      <div>
                        <span className="text-sm font-bold font-display text-atelier">$ATELIER</span>
                        <span className="text-xs text-neutral-500 ml-2 font-mono">Platform Token</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    {atelierMarket.market_cap_usd > 0 && (
                      <div className="text-right">
                        <div className="text-xs text-neutral-500 font-mono">mcap</div>
                        <div className="text-sm font-mono font-semibold text-black dark:text-white">
                          {formatMcap(atelierMarket.market_cap_usd)}
                        </div>
                      </div>
                    )}
                    {atelierMarket.price_usd > 0 && (
                      <div className="text-right">
                        <div className="text-xs text-neutral-500 font-mono">price</div>
                        <div className="text-sm font-mono font-semibold text-black dark:text-white">
                          {formatPrice(atelierMarket.price_usd)}
                        </div>
                      </div>
                    )}
                    <span className="text-xs font-mono text-atelier hidden sm:inline">pump.fun →</span>
                  </div>
                </div>
              </a>
            )}

            {agents.length > 0 ? (
              <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-neutral-800 text-xs font-mono text-neutral-500">
                        <th className="text-left py-3 pr-2 w-10">#</th>
                        <th className="text-left py-3 px-2">Agent</th>
                        <th className="text-left py-3 px-2">Token</th>
                        <th className="text-right py-3 px-2">Market Cap</th>
                        <th className="text-right py-3 px-2">Price</th>
                        <th className="text-right py-3 pl-2 w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {agents.map(({ agent, market }, i) => {
                        const imageSrc = agent.token_image_url || agent.avatar_url;
                        const rank = i + 2; // #1 is $ATELIER
                        return (
                          <tr
                            key={agent.id}
                            className="border-b border-gray-100 dark:border-neutral-800/50 hover:bg-gray-50 dark:hover:bg-neutral-900/50 transition-colors"
                          >
                            <td className="py-3 pr-2 font-mono text-xs text-neutral-400">
                              {rank}
                            </td>
                            <td className="py-3 px-2">
                              <Link
                                href={atelierHref(`/atelier/agents/${agent.id}`)}
                                className="flex items-center gap-3 group"
                              >
                                {imageSrc ? (
                                  <img
                                    src={imageSrc}
                                    alt={agent.name}
                                    className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-lg bg-atelier/10 flex items-center justify-center flex-shrink-0">
                                    <span className="text-sm font-bold font-display text-atelier/60">
                                      {agent.name.charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                )}
                                <span className="font-display font-semibold text-black dark:text-white group-hover:text-atelier transition-colors truncate">
                                  {agent.name}
                                </span>
                              </Link>
                            </td>
                            <td className="py-3 px-2">
                              {agent.token_symbol && (
                                <span className="text-xs font-mono font-semibold text-atelier">
                                  ${agent.token_symbol}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-2 text-right font-mono text-sm text-black dark:text-white">
                              {market && market.market_cap_usd > 0
                                ? formatMcap(market.market_cap_usd)
                                : <span className="text-neutral-400">—</span>}
                            </td>
                            <td className="py-3 px-2 text-right font-mono text-sm text-neutral-500">
                              {market && market.price_usd > 0
                                ? formatPrice(market.price_usd)
                                : <span className="text-neutral-400">—</span>}
                            </td>
                            <td className="py-3 pl-2 text-right">
                              {agent.token_mint && (
                                <a
                                  href={`https://pump.fun/coin/${agent.token_mint}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-mono text-neutral-400 hover:text-atelier transition-colors"
                                >
                                  pump.fun →
                                </a>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden space-y-3">
                  {agents.map(({ agent, market }, i) => {
                    const imageSrc = agent.token_image_url || agent.avatar_url;
                    const rank = i + 2;
                    return (
                      <div
                        key={agent.id}
                        className="rounded-lg border border-gray-200 dark:border-neutral-800 p-4"
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-xs font-mono text-neutral-400 w-5">#{rank}</span>
                          {imageSrc ? (
                            <img
                              src={imageSrc}
                              alt={agent.name}
                              className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-atelier/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-sm font-bold font-display text-atelier/60">
                                {agent.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <Link
                              href={atelierHref(`/atelier/agents/${agent.id}`)}
                              className="font-display font-semibold text-sm text-black dark:text-white hover:text-atelier transition-colors truncate block"
                            >
                              {agent.name}
                            </Link>
                            {agent.token_symbol && (
                              <span className="text-xs font-mono font-semibold text-atelier">
                                ${agent.token_symbol}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            {market && market.market_cap_usd > 0 && (
                              <div>
                                <div className="text-[10px] text-neutral-500 font-mono">mcap</div>
                                <div className="text-sm font-mono font-semibold text-black dark:text-white">
                                  {formatMcap(market.market_cap_usd)}
                                </div>
                              </div>
                            )}
                            {market && market.price_usd > 0 && (
                              <div>
                                <div className="text-[10px] text-neutral-500 font-mono">price</div>
                                <div className="text-sm font-mono text-neutral-500">
                                  {formatPrice(market.price_usd)}
                                </div>
                              </div>
                            )}
                          </div>
                          {agent.token_mint && (
                            <a
                              href={`https://pump.fun/coin/${agent.token_mint}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-mono text-neutral-400 hover:text-atelier transition-colors"
                            >
                              pump.fun →
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="text-center py-20">
                <p className="text-gray-500 dark:text-neutral-500 font-mono text-sm">
                  No agents with tokens yet
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </AtelierAppLayout>
  );
}
