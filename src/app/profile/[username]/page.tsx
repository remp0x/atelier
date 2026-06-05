import { notFound } from 'next/navigation';
import Image from 'next/image';
import { AgentAvatar } from '@/components/atelier/AgentAvatar';
import Link from 'next/link';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { ProfileOwnerPanel } from '@/components/atelier/ProfileOwnerPanel';
import {
  getUserByUsername,
  getAtelierAgentsByPrivyUser,
  getOrdersCountByUser,
  getReviewsLeftCountByUser,
  type AtelierAgent,
  type AtelierUser,
} from '@/lib/atelier-db';
import { atelierHref } from '@/lib/atelier-paths';

export const dynamic = 'force-dynamic';

interface ProfilePageProps {
  params: Promise<{ username: string }>;
}

function truncateAddress(address: string): string {
  if (address.startsWith('0x')) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function formatMemberSince(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString('en', { month: 'short', year: 'numeric' });
}

function StatChip({ label, value }: { label: string; value: string | number }): React.ReactElement {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-600">{label}</span>
      <span className="text-lg font-mono font-bold text-white">{value}</span>
    </div>
  );
}

function AgentCard({ agent }: { agent: AtelierAgent }): React.ReactElement {
  return (
    <Link
      href={atelierHref(`/atelier/agents/${agent.slug}`)}
      className="group flex flex-col gap-3 p-4 rounded-xl bg-black/40 border border-white/5 hover:border-atelier/30 transition-colors duration-200 cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <AgentAvatar name={agent.name} seed={agent.id} src={agent.avatar_url} className="w-10 h-10 rounded-lg flex-shrink-0 border border-white/5" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold font-display text-white group-hover:text-atelier transition-colors duration-200 truncate">
              {agent.name}
            </span>
            {agent.blue_check === 1 && (
              <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-label="Verified">
                <path fillRule="evenodd" d="M16.403 12.652a3 3 0 010-5.304 3 3 0 00-3.75-3.751 3 3 0 00-5.305 0 3 3 0 00-3.751 3.75 3 3 0 000 5.305 3 3 0 003.75 3.751 3 3 0 005.305 0 3 3 0 003.751-3.75zm-2.546-4.46a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          {agent.description && (
            <p className="text-xs text-neutral-500 font-mono truncate mt-0.5">
              {agent.description}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 pt-1 border-t border-white/5">
        <span className="text-xs font-mono text-neutral-500">
          <span className="text-neutral-300 font-semibold">{agent.completed_orders}</span> orders
        </span>
        {agent.avg_rating != null && (
          <span className="text-xs font-mono text-atelier font-semibold">
            {agent.avg_rating.toFixed(1)} avg
          </span>
        )}
      </div>
    </Link>
  );
}

function ProfileHero({
  user,
  activeAgentCount,
  ordersCount,
  reviewsCount,
}: {
  user: AtelierUser;
  activeAgentCount: number;
  ordersCount: number;
  reviewsCount: number;
}): React.ReactElement {
  const displayName = user.display_name || user.username || 'Anonymous';
  const avatarLetter = displayName.charAt(0).toUpperCase();

  return (
    <div className="relative rounded-2xl overflow-hidden border border-white/5 bg-black/40">
      <div className="relative px-6 pt-6 pb-6">
        <div className="flex items-end gap-4 mb-5">
          <div className="relative w-24 h-24 rounded-2xl overflow-hidden flex-shrink-0 ring-2 ring-black/40 border border-white/10 bg-atelier/10">
            {user.avatar_url ? (
              <Image
                src={user.avatar_url}
                alt={displayName}
                fill
                sizes="96px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-4xl font-bold font-display text-atelier/60">
                {avatarLetter}
              </span>
            )}
          </div>
          <div className="pb-1 min-w-0">
            <h1 className="text-3xl font-bold font-display text-white leading-tight truncate">
              {displayName}
            </h1>
            {user.username && (
              <p className="text-sm font-mono text-atelier mt-0.5">@{user.username}</p>
            )}
            {user.twitter_username && (
              <a
                href={`https://x.com/${user.twitter_username}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${user.twitter_username} on X`}
                className="inline-flex items-center gap-1.5 text-xs font-mono text-neutral-500 hover:text-atelier transition-colors duration-200 mt-1"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                @{user.twitter_username}
              </a>
            )}
          </div>
        </div>

        {user.bio && (
          <p className="text-sm font-sans text-neutral-300 leading-relaxed max-w-prose mb-5">
            {user.bio}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4 border-y border-white/5 mb-5">
          <StatChip label="Agents" value={activeAgentCount} />
          <div className="w-px h-8 bg-white/5 hidden sm:block" />
          <StatChip label="Orders" value={ordersCount} />
          <div className="w-px h-8 bg-white/5 hidden sm:block" />
          <StatChip label="Reviews" value={reviewsCount} />
          <div className="w-px h-8 bg-white/5 hidden sm:block" />
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-600">Member since</span>
            <span className="text-sm font-mono text-neutral-300">{formatMemberSince(user.created_at)}</span>
          </div>
        </div>

        <ProfileOwnerPanel user={user} />
      </div>
    </div>
  );
}

export default async function PublicProfilePage({ params }: ProfilePageProps): Promise<React.ReactElement> {
  const { username } = await params;
  const user = await getUserByUsername(username);
  if (!user) notFound();

  const [agents, ordersCount, reviewsCount] = await Promise.all([
    getAtelierAgentsByPrivyUser(user.privy_user_id),
    getOrdersCountByUser(user.privy_user_id),
    getReviewsLeftCountByUser(user.privy_user_id),
  ]);

  const activeAgents = agents.filter((a) => a.active === 1);

  return (
    <AtelierAppLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <ProfileHero
          user={user}
          activeAgentCount={activeAgents.length}
          ordersCount={ordersCount}
          reviewsCount={reviewsCount}
        />

        <section>
          <h2 className="text-[10px] font-mono uppercase tracking-widest text-neutral-600 mb-4">
            Agents
            {activeAgents.length > 0 && (
              <span className="ml-2 font-mono text-neutral-700">({activeAgents.length})</span>
            )}
          </h2>
          {activeAgents.length === 0 ? (
            <p className="text-sm font-mono text-neutral-600">No agents yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeAgents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          )}
        </section>
      </div>
    </AtelierAppLayout>
  );
}
