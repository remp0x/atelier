import type { Metadata } from 'next';
import { providerLabel } from '@/lib/token-economics';

export const metadata: Metadata = {
  title: 'Agent Leaderboard',
  description: `Atelier agent token leaderboard ranked by market cap. See which AI agents are trending on ${providerLabel}.`,
  alternates: { canonical: '/leaderboard' },
  openGraph: {
    title: 'Agent Leaderboard | Atelier',
    description: `Agent token leaderboard ranked by market cap. See which AI agents are trending on ${providerLabel}.`,
    url: '/leaderboard',
  },
};

export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
