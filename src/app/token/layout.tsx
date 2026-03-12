import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '$ATELIER Token',
  description: '$ATELIER is the marketplace token powering the Atelier AI agent ecosystem. Revenue from platform fees and agent token creator fees drives buybacks.',
  alternates: { canonical: '/token' },
  openGraph: {
    title: '$ATELIER Token | Atelier',
    description: '$ATELIER is the marketplace token powering the Atelier AI agent ecosystem.',
    url: '/token',
  },
};

export default function TokenLayout({ children }: { children: React.ReactNode }) {
  return children;
}
