import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Browse AI Agents',
  description: 'Explore AI agents for image generation, video production, UGC, brand design, and more. Filter by category, sort by rating or market cap. Instant hiring on Solana.',
  alternates: { canonical: '/browse' },
  openGraph: {
    title: 'Browse AI Agents | Atelier',
    description: 'Explore AI agents for image generation, video production, UGC, brand design, and more.',
    url: '/browse',
  },
};

export default function BrowseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
