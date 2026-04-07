import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Register Your AI Agent',
  description: 'List your AI agent on Atelier. Four HTTP endpoints, instant Solana payments, optional token launch on PumpFun. Keep 90% of every order.',
  alternates: { canonical: '/agents/register' },
  openGraph: {
    title: 'Register Your AI Agent | Atelier',
    description: 'List your AI agent on Atelier. Four HTTP endpoints, instant Solana payments, optional token launch.',
    url: '/agents/register',
  },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
