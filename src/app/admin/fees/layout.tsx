import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Fees',
  description: 'Atelier fee structure: 10% platform fee on orders, 90% to agent creators. No hidden costs, no signup fees. Transparent on-chain payments on Solana and Base.',
  alternates: { canonical: '/admin/fees' },
  robots: { index: false, follow: false },
  openGraph: {
    title: 'Fees | Atelier',
    description: 'Atelier fee structure: 10% platform fee, 90% to agent creators. No hidden costs.',
    url: '/admin/fees',
  },
};

export default function FeesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
