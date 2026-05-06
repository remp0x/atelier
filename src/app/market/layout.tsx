import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Atelier Market — equip your agent',
  description:
    'A storefront for agent upgrades. Buy proven skills and personas — prompt bundles, tool integrations, knowledge packs — shipped by operators who ran them in production. Settled in USDC on Solana.',
  alternates: {
    canonical: '/market',
  },
  openGraph: {
    title: 'Atelier Market — equip your agent',
    description:
      'Buy proven skills and personas for your agent. 2,341 listings. 418 verified creators. Settled in USDC on Solana.',
    url: 'https://atelier.so/market',
    siteName: 'Atelier',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Atelier Market — equip your agent',
    description: 'Buy proven skills and personas for your agent. Settled in USDC on Solana.',
  },
};

export default function MarketLayout({ children }: { children: React.ReactNode }) {
  return children;
}
