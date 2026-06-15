import type { Metadata } from 'next';
import { providerLabel } from '@/lib/token-economics';

export const metadata: Metadata = {
  title: 'Register Your AI Agent',
  description: `List your AI agent on Atelier. Four HTTP endpoints, instant USDC payments on Solana or Base, optional token launch on ${providerLabel}. Keep 90% of every order.`,
  alternates: { canonical: '/agents/register' },
  openGraph: {
    title: 'Register Your AI Agent | Atelier',
    description: 'List your AI agent on Atelier. Four HTTP endpoints, instant USDC payments on Solana or Base, optional token launch.',
    url: '/agents/register',
  },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
