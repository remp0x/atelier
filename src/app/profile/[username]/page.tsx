import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import {
  getUserByUsername,
  getUserWallets,
  getAtelierAgentsByPrivyUser,
  type AtelierAgent,
  type UserWallet,
} from '@/lib/atelier-db';
import { atelierHref } from '@/lib/atelier-paths';

export const dynamic = 'force-dynamic';

interface ProfilePageProps {
  params: Promise<{ username: string }>;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function AgentRow({ agent }: { agent: AtelierAgent }) {
  return (
    <Link
      href={atelierHref(`/atelier/agents/${agent.slug}`)}
      className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800 hover:border-atelier/40 transition-colors"
    >
      <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-atelier/10">
        {agent.avatar_url ? (
          <Image
            src={agent.avatar_url}
            alt={agent.name}
            fill
            sizes="40px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-lg font-bold font-display text-atelier/60">
            {agent.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold font-display text-black dark:text-white truncate">
            {agent.name}
          </span>
          {agent.blue_check === 1 && (
            <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.403 12.652a3 3 0 010-5.304 3 3 0 00-3.75-3.751 3 3 0 00-5.305 0 3 3 0 00-3.751 3.75 3 3 0 000 5.305 3 3 0 003.75 3.751 3 3 0 005.305 0 3 3 0 003.751-3.75zm-2.546-4.46a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
          )}
        </div>
        {agent.description && (
          <p className="text-xs text-gray-500 dark:text-neutral-500 font-mono truncate mt-0.5">
            {agent.description}
          </p>
        )}
      </div>

      <div className="flex-shrink-0 text-right">
        <span className="text-xs font-mono text-gray-400 dark:text-neutral-500">
          {agent.completed_orders} orders
        </span>
        {agent.avg_rating != null && (
          <div className="text-xs font-mono text-atelier">{agent.avg_rating.toFixed(1)}</div>
        )}
      </div>
    </Link>
  );
}

function WalletRow({ wallet }: { wallet: UserWallet }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800">
      <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-gray-300 dark:border-neutral-700 text-gray-500 dark:text-neutral-500 flex-shrink-0">
        {wallet.chain}
      </span>
      <code className="flex-1 text-xs font-mono text-black dark:text-white truncate">
        {truncateAddress(wallet.address)}
      </code>
      {wallet.is_primary === 1 && (
        <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-atelier/10 text-atelier flex-shrink-0">
          primary
        </span>
      )}
    </div>
  );
}

export default async function PublicProfilePage({ params }: ProfilePageProps) {
  const { username } = await params;
  const user = await getUserByUsername(username);
  if (!user) notFound();

  const [wallets, agents] = await Promise.all([
    getUserWallets(user.privy_user_id),
    getAtelierAgentsByPrivyUser(user.privy_user_id),
  ]);

  const activeAgents = agents.filter((a) => a.active === 1);
  const displayName = user.display_name || user.username || 'Anonymous';
  const avatarLetter = displayName.charAt(0).toUpperCase();

  return (
    <AtelierAppLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {/* Header card */}
        <div className="flex items-start gap-4">
          <div className="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 border border-gray-200 dark:border-neutral-800 bg-atelier/10">
            {user.avatar_url ? (
              <Image
                src={user.avatar_url}
                alt={displayName}
                fill
                sizes="80px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-3xl font-bold font-display text-atelier/60">
                {avatarLetter}
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0 pt-1">
            <h1 className="text-xl font-bold font-display text-black dark:text-white truncate">
              {displayName}
            </h1>
            {user.username && (
              <p className="text-sm font-mono text-gray-400 dark:text-neutral-500 mt-0.5">
                @{user.username}
              </p>
            )}
            {user.twitter_username && (
              <a
                href={`https://x.com/${user.twitter_username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-mono text-atelier hover:underline mt-1"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                @{user.twitter_username}
              </a>
            )}
            {user.bio && (
              <p className="text-sm font-mono text-gray-500 dark:text-neutral-400 mt-2 leading-relaxed">
                {user.bio}
              </p>
            )}
          </div>
        </div>

        {/* Wallets */}
        {wallets.length > 0 && (
          <section>
            <h2 className="text-xs font-mono uppercase tracking-wider text-gray-400 dark:text-neutral-500 mb-3">
              Linked Wallets
            </h2>
            <div className="space-y-2">
              {wallets.map((w) => (
                <WalletRow key={w.id} wallet={w} />
              ))}
            </div>
          </section>
        )}

        {/* Agents */}
        <section>
          <h2 className="text-xs font-mono uppercase tracking-wider text-gray-400 dark:text-neutral-500 mb-3">
            Agents{activeAgents.length > 0 && (
              <span className="ml-2 font-mono text-gray-400 dark:text-neutral-600">
                ({activeAgents.length})
              </span>
            )}
          </h2>
          {activeAgents.length === 0 ? (
            <p className="text-sm font-mono text-gray-400 dark:text-neutral-600">
              No agents yet.
            </p>
          ) : (
            <div className="space-y-2">
              {activeAgents.map((agent) => (
                <AgentRow key={agent.id} agent={agent} />
              ))}
            </div>
          )}
        </section>
      </div>
    </AtelierAppLayout>
  );
}
