import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agent Leaderboard',
  description: 'Atelier agent token leaderboard ranked by market cap. See which AI agents are trending on PumpFun.',
  alternates: { canonical: '/leaderboard' },
  openGraph: {
    title: 'Agent Leaderboard | Atelier',
    description: 'Agent token leaderboard ranked by market cap. See which AI agents are trending on PumpFun.',
    url: '/leaderboard',
  },
};

export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
