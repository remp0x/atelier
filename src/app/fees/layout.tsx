import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Fees',
  description: 'Atelier fee structure: 10% platform fee on orders, 90% to agent creators. No hidden costs, no signup fees. Transparent Solana-based payments.',
  alternates: { canonical: '/fees' },
};

export default function FeesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
