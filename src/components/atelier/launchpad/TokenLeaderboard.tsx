'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { AgentAvatar } from '@/components/atelier/AgentAvatar';
import { atelierHref } from '@/lib/atelier-paths';
import { formatMcap, formatPrice } from '@/lib/format';
import type { AtelierAgentListItem } from '@/lib/atelier-db';
import type { MarketData } from '@/app/api/market/route';

interface AgentWithMarket {
  agent: AtelierAgentListItem;
  market: MarketData | null;
}

const ATELIER_MINT = '7newJUjH7LGsGPDfEq83gxxy2d1q39A84SeUKha8pump';

export function TokenLeaderboard() {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-5 h-5 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {atelierMarket && (
        <a
          href={`https://pump.fun/coin/${ATELIER_MINT}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-lg border border-atelier/30 bg-atelier/5 hover:bg-atelier/10 transition-colors px-5 py-4"
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4">
              <span className="text-xs font-mono font-bold text-atelier/50 w-6 text-center">#1</span>
              <div className="flex items-center gap-3">
                <img src="/atelier_wb.svg" alt="ATELIER" className="w-9 h-9 rounded-lg flex-shrink-0" />
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
              <span className="text-xs font-mono text-atelier hidden sm:inline">pump.fun &#x2192;</span>
            </div>
          </div>
        </a>
      )}

      {agents.length === 0 ? (
        <div className="text-center py-12 rounded-lg border border-gray-200 dark:border-neutral-800">
          <p className="text-gray-500 dark:text-neutral-500 font-mono text-sm">No agent tokens yet</p>
        </div>
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-black-soft border-b border-gray-200 dark:border-neutral-800 text-xs font-mono text-neutral-500">
                  <th className="text-left py-2.5 px-3 w-10">#</th>
                  <th className="text-left py-2.5 px-2">Agent</th>
                  <th className="text-left py-2.5 px-2">Token</th>
                  <th className="text-right py-2.5 px-2">Market Cap</th>
                  <th className="text-right py-2.5 px-2">Price</th>
                  <th className="text-right py-2.5 px-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {agents.map(({ agent, market }, i) => {
                  const imageSrc = agent.avatar_url || agent.token_image_url;
                  const rank = i + 2;
                  return (
                    <tr
                      key={agent.id}
                      className="border-b border-gray-100 dark:border-neutral-800/50 hover:bg-gray-50 dark:hover:bg-neutral-900/50 transition-colors last:border-b-0"
                    >
                      <td className="py-2.5 px-3 font-mono text-xs text-neutral-400">{rank}</td>
                      <td className="py-2.5 px-2">
                        <Link
                          href={atelierHref(`/atelier/agents/${agent.slug}`)}
                          className="flex items-center gap-3 group"
                        >
                          <AgentAvatar name={agent.name} seed={agent.id} src={imageSrc} className="w-8 h-8 rounded-lg flex-shrink-0" />
                          <span className="font-display font-semibold text-black dark:text-white group-hover:text-atelier transition-colors truncate">
                            {agent.name}
                          </span>
                        </Link>
                      </td>
                      <td className="py-2.5 px-2">
                        {agent.token_symbol && (
                          <span className="text-xs font-mono font-semibold text-atelier">${agent.token_symbol}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-sm text-black dark:text-white">
                        {market && market.market_cap_usd > 0 ? (
                          formatMcap(market.market_cap_usd)
                        ) : (
                          <span className="text-neutral-400">&#x2014;</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-sm text-neutral-500">
                        {market && market.price_usd > 0 ? (
                          formatPrice(market.price_usd)
                        ) : (
                          <span className="text-neutral-400">&#x2014;</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {agent.token_mint && (
                          <a
                            href={`https://dexscreener.com/solana/${agent.token_mint}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-mono text-neutral-400 hover:text-atelier transition-colors"
                          >
                            dex &#x2192;
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {agents.map(({ agent, market }, i) => {
              const imageSrc = agent.avatar_url || agent.token_image_url;
              const rank = i + 2;
              return (
                <div key={agent.id} className="rounded-lg border border-gray-200 dark:border-neutral-800 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs font-mono text-neutral-400 w-5">#{rank}</span>
                    <AgentAvatar name={agent.name} seed={agent.id} src={imageSrc} className="w-8 h-8 rounded-lg flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={atelierHref(`/atelier/agents/${agent.slug}`)}
                        className="font-display font-semibold text-sm text-black dark:text-white hover:text-atelier transition-colors truncate block"
                      >
                        {agent.name}
                      </Link>
                      {agent.token_symbol && (
                        <span className="text-xs font-mono font-semibold text-atelier">${agent.token_symbol}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 pt-2.5 border-t border-gray-100 dark:border-neutral-800/50">
                    <div>
                      <div className="text-[10px] font-mono text-neutral-500">mcap</div>
                      <div className="text-sm font-mono font-semibold text-black dark:text-white">
                        {market && market.market_cap_usd > 0 ? formatMcap(market.market_cap_usd) : <span className="text-neutral-400">&#x2014;</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono text-neutral-500">price</div>
                      <div className="text-sm font-mono text-neutral-500">
                        {market && market.price_usd > 0 ? formatPrice(market.price_usd) : <span className="text-neutral-400">&#x2014;</span>}
                      </div>
                    </div>
                    {agent.token_mint && (
                      <div className="ml-auto">
                        <a
                          href={`https://dexscreener.com/solana/${agent.token_mint}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-mono text-neutral-400 hover:text-atelier transition-colors"
                        >
                          dex &#x2192;
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
