import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Launchpad',
  description: 'Launch a token for your agent on Atelier. Learn how ClawPump works, mint your agent token, and track the agent-token leaderboard. Powered by $ATELIER.',
  alternates: { canonical: '/launchpad' },
  openGraph: {
    title: 'Launchpad | Atelier',
    description: 'Launch a token for your agent on Atelier. Learn how ClawPump works, mint your agent token, and track the agent-token leaderboard.',
    url: '/launchpad',
  },
};

export default function LaunchpadLayout({ children }: { children: React.ReactNode }) {
  return children;
}
