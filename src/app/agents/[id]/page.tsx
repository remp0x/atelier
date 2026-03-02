'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { atelierHref } from '@/lib/atelier-paths';
import { useWallet } from '@solana/wallet-adapter-react';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { ServiceCard } from '@/components/atelier/ServiceCard';
import { HireModal } from '@/components/atelier/HireModal';
import { TokenLaunchSection } from '@/components/atelier/TokenLaunchSection';
import type { Service, ServiceReview, RecentAgentOrder, PortfolioItem } from '@/lib/atelier-db';

function getTimeAgo(dateStr: string): string {
  const utcStr = dateStr.includes('Z') || dateStr.includes('+') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  const diff = Date.now() - new Date(utcStr).getTime();
  if (diff < 60000) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5';
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          className={`${cls} ${i < rating ? 'text-atelier' : 'text-gray-200 dark:text-neutral-800'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'text-emerald-500',
  in_progress: 'text-atelier',
  delivered: 'text-atelier',
  cancelled: 'text-red-400',
  disputed: 'text-red-400',
};

type TabId = 'services' | 'portfolio' | 'reviews' | 'activity';

interface AgentTokenInfo {
  mint: string | null;
  name: string | null;
  symbol: string | null;
  image_url: string | null;
  mode: 'pumpfun' | 'byot' | null;
  creator_wallet: string | null;
  tx_hash: string | null;
}

interface AgentDetail {
  id: string;
  name: string;
  description: string | null;
  bio?: string | null;
  avatar_url: string | null;
  source: 'atelier' | 'external' | 'official';
  verified: number;
  blue_check: number;
  is_atelier_official?: number;
  twitter_username?: string | null;
  endpoint_url?: string;
  capabilities?: string[];
  owner_wallet?: string | null;
  token?: AgentTokenInfo;
}

interface AgentData {
  agent: AgentDetail;
  services: Service[];
  portfolio: PortfolioItem[];
  stats: {
    completed_orders: number;
    avg_rating: number | null;
    followers: number;
    services_count: number;
  };
  reviews: ServiceReview[];
  recentOrders: RecentAgentOrder[];
}

export default function AtelierAgentPage() {
  const params = useParams();
  const { publicKey } = useWallet();
  const [data, setData] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hireService, setHireService] = useState<Service | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('services');

  async function loadAgent() {
    try {
      const res = await fetch(`/api/agents/${params.id}`);
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'Agent not found');
        return;
      }
      setData(json.data);
    } catch {
      setError('Failed to load agent');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAgent();
  }, [params.id]);

  if (loading) {
    return (
      <AtelierAppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-6 h-6 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
        </div>
      </AtelierAppLayout>
    );
  }

  if (error || !data) {
    return (
      <AtelierAppLayout>
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
          <p className="text-gray-500 dark:text-neutral-500 font-mono">{error || 'Agent not found'}</p>
          <Link href={atelierHref('/atelier/browse')} className="text-atelier font-mono text-sm hover:underline">
            Back to Browse
          </Link>
        </div>
      </AtelierAppLayout>
    );
  }

  const { agent, services, portfolio, stats, reviews, recentOrders } = data;
  const avatarLetter = agent.name.charAt(0).toUpperCase();
  const isOwner = publicKey && agent.owner_wallet === publicKey.toBase58();

  const avgRating = stats.avg_rating
    ?? (reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0);
  const roundedRating = Math.round(avgRating);

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: 'services', label: 'Services', count: services.length },
    { id: 'portfolio', label: 'Portfolio', count: portfolio.length },
    { id: 'reviews', label: 'Reviews', count: reviews.length },
    { id: 'activity', label: 'Activity', count: recentOrders.length },
  ];

  return (
    <AtelierAppLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Back link */}
        <Link
          href={atelierHref('/atelier/browse')}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-neutral-400 hover:text-atelier font-mono mb-6 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back
        </Link>

        {/* ── Profile card ── */}
        <div className="rounded-xl bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800 p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="shrink-0">
              {agent.avatar_url ? (
                <img src={agent.avatar_url} alt={agent.name} className="w-20 h-20 rounded-xl object-cover" />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-atelier/20 flex items-center justify-center text-atelier text-2xl font-bold font-mono">
                  {avatarLetter}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold font-display text-black dark:text-white">{agent.name}</h1>
                {agent.verified === 1 && agent.is_atelier_official !== 1 && agent.blue_check !== 1 && (
                  <svg className="w-5 h-5 text-atelier" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.403 12.652a3 3 0 010-5.304 3 3 0 00-3.75-3.751 3 3 0 00-5.305 0 3 3 0 00-3.751 3.75 3 3 0 000 5.305 3 3 0 003.75 3.751 3 3 0 005.305 0 3 3 0 003.751-3.75zm-2.546-4.46a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                  </svg>
                )}
                {agent.is_atelier_official === 1 && (
                  <svg className="w-5 h-5 text-atelier" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.403 12.652a3 3 0 010-5.304 3 3 0 00-3.75-3.751 3 3 0 00-5.305 0 3 3 0 00-3.751 3.75 3 3 0 000 5.305 3 3 0 003.75 3.751 3 3 0 005.305 0 3 3 0 003.751-3.75zm-2.546-4.46a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                  </svg>
                )}
                {agent.blue_check === 1 && agent.is_atelier_official !== 1 && (
                  <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.403 12.652a3 3 0 010-5.304 3 3 0 00-3.75-3.751 3 3 0 00-5.305 0 3 3 0 00-3.751 3.75 3 3 0 000 5.305 3 3 0 003.75 3.751 3 3 0 005.305 0 3 3 0 003.751-3.75zm-2.546-4.46a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                  </svg>
                )}
                <span className="px-2 py-0.5 rounded text-2xs font-mono bg-atelier/10 text-atelier">
                  {agent.source === 'official' ? 'by ATELIER' : agent.source === 'external' ? 'External' : 'Atelier'}
                </span>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <StarRating rating={roundedRating} size="md" />
                <span className="text-sm font-mono text-neutral-500">
                  {reviews.length > 0
                    ? `${avgRating.toFixed(1)} (${reviews.length} ${reviews.length === 1 ? 'review' : 'reviews'})`
                    : '0 reviews'}
                </span>
              </div>

              <p className="text-sm text-gray-500 dark:text-neutral-400 mb-3">
                {agent.bio || agent.description}
              </p>

              <div className="flex items-center gap-4 text-xs font-mono text-neutral-500">
                <span>{stats.completed_orders} orders</span>
                <span className="text-neutral-700 dark:text-neutral-700">·</span>
                <span>{stats.followers} followers</span>
                <span className="text-neutral-700 dark:text-neutral-700">·</span>
                <span>{stats.services_count} services</span>
              </div>
            </div>
          </div>

          {/* Token — inside profile card */}
          <div className="mt-5 pt-5 border-t border-gray-200 dark:border-neutral-800">
            <TokenLaunchSection
              agentId={agent.id}
              agentName={agent.name}
              agentDescription={agent.bio || agent.description || ''}
              agentAvatarUrl={agent.avatar_url}
              token={agent.token || null}
              ownerWallet={agent.owner_wallet || null}
              onTokenSet={loadAgent}
            />
            {agent.token?.mode === 'pumpfun' && agent.token.creator_wallet && publicKey?.toBase58() === agent.token.creator_wallet && (
              <p className="mt-2 text-2xs text-neutral-500 font-mono">
                Creator fees: managed by Atelier (90% yours, 10% platform fee)
              </p>
            )}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 border-b border-gray-200 dark:border-neutral-800 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-mono transition-colors relative ${
                activeTab === tab.id
                  ? 'text-atelier'
                  : 'text-neutral-500 hover:text-black dark:hover:text-white'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-1.5 text-2xs ${activeTab === tab.id ? 'text-atelier' : 'text-neutral-600'}`}>
                  {tab.count}
                </span>
              )}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-atelier rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}

        {/* Services */}
        {activeTab === 'services' && (
          services.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {services.map((svc) => (
                <ServiceCard
                  key={svc.id}
                  service={svc}
                  onHire={['fixed', 'weekly', 'monthly'].includes(svc.price_type) ? () => setHireService(svc) : undefined}
                />
              ))}
            </div>
          ) : (
            <EmptyTab message="No services listed yet" />
          )
        )}

        {/* Portfolio */}
        {activeTab === 'portfolio' && (
          portfolio.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {portfolio.map((item, idx) => {
                const isFeatured = idx < 2 && portfolio.length >= 4;
                return (
                  <div
                    key={`${item.source_type}-${item.source_id}`}
                    className={`group relative rounded-lg overflow-hidden bg-gray-100 dark:bg-black-soft border border-gray-200 dark:border-neutral-800 hover:border-atelier/30 transition-colors ${
                      isFeatured ? 'aspect-[4/3]' : 'aspect-square'
                    }`}
                  >
                    {item.deliverable_media_type === 'video' ? (
                      <video
                        src={item.deliverable_url}
                        className="w-full h-full object-cover"
                        muted
                        loop
                        playsInline
                        onMouseOver={(e) => (e.target as HTMLVideoElement).play()}
                        onMouseOut={(e) => { (e.target as HTMLVideoElement).pause(); (e.target as HTMLVideoElement).currentTime = 0; }}
                      />
                    ) : (
                      <img
                        src={item.deliverable_url}
                        alt={item.prompt || 'Portfolio piece'}
                        className="w-full h-full object-cover"
                        loading={idx < 6 ? 'eager' : 'lazy'}
                      />
                    )}
                    {item.prompt && (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-200">
                        <p className="text-xs text-white/90 font-mono line-clamp-2">{item.prompt}</p>
                      </div>
                    )}
                    {isOwner && (
                      <button
                        onClick={async () => {
                          await fetch(`/api/agents/${agent.id}/portfolio`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              action: 'hide',
                              source_type: item.source_type,
                              source_id: item.source_id,
                            }),
                          });
                          loadAgent();
                        }}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                        title="Hide from portfolio"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyTab message="No portfolio items yet" />
          )
        )}

        {/* Reviews */}
        {activeTab === 'reviews' && (
          reviews.length > 0 ? (
            <div className="space-y-3">
              {reviews.map((review) => (
                <div key={review.id} className="p-4 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-black dark:text-white font-display">{review.reviewer_name}</span>
                    <StarRating rating={review.rating} />
                  </div>
                  {review.comment && (
                    <p className="text-sm text-gray-500 dark:text-neutral-400">{review.comment}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <StarRating rating={0} size="md" />
              <p className="text-xs font-mono text-neutral-500 mt-2">No reviews yet</p>
            </div>
          )
        )}

        {/* Activity */}
        {activeTab === 'activity' && (
          recentOrders.length > 0 ? (
            <div className="space-y-1">
              {recentOrders.map((order) => {
                const wallet = order.client_wallet;
                const displayName = order.client_display_name
                  || (wallet ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}` : 'Anonymous');
                const statusColor = STATUS_COLORS[order.status] || 'text-neutral-500';
                return (
                  <div key={order.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-black-soft transition-colors">
                    <div className="w-6 h-6 rounded bg-atelier/10 flex items-center justify-center text-atelier text-2xs font-bold font-mono flex-shrink-0">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-mono text-black dark:text-white truncate">{displayName}</span>
                    <span className="text-2xs text-neutral-500 font-mono truncate hidden sm:block">{order.service_title}</span>
                    <div className="ml-auto flex items-center gap-3 flex-shrink-0">
                      {order.quoted_price_usd && (
                        <span className="text-xs font-mono text-neutral-400">
                          ${parseFloat(order.quoted_price_usd).toFixed(0)}
                        </span>
                      )}
                      <span className={`text-2xs font-mono ${statusColor}`}>
                        {order.status.replace(/_/g, ' ')}
                      </span>
                      <span className="text-2xs text-neutral-600 font-mono">{getTimeAgo(order.created_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyTab message="No recent activity" />
          )
        )}

        {/* Empty state for external agents */}
        {agent.source === 'external' && services.length === 0 && portfolio.length === 0 && activeTab === 'services' && (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-neutral-500 font-mono text-sm mb-2">This is an external agent</p>
            {agent.endpoint_url && (
              <p className="text-xs text-gray-400 dark:text-neutral-400">
                Endpoint: <code className="text-atelier">{agent.endpoint_url}</code>
              </p>
            )}
          </div>
        )}
      </div>

      {hireService && (
        <HireModal
          service={hireService}
          open={!!hireService}
          onClose={() => setHireService(null)}
        />
      )}
    </AtelierAppLayout>
  );
}

function EmptyTab({ message }: { message: string }) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm font-mono text-neutral-500">{message}</p>
    </div>
  );
}
