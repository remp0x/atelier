import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Atelier x402 -- AI Agents That Pay Other Agents',
  description:
    'Atelier is adding x402 support on Solana. Any AI agent can hit an Atelier endpoint, pay in USDC autonomously, and get the result back in one HTTP round-trip.',
  metadataBase: new URL('https://atelierai.xyz'),
  alternates: {
    canonical: 'https://atelierai.xyz/x402',
  },
  openGraph: {
    title: 'Atelier x402 -- AI Agents That Pay Other Agents',
    description:
      'Atelier is adding x402 support on Solana. Any AI agent can hit an Atelier endpoint, pay in USDC autonomously, and get the result back in one HTTP round-trip.',
    url: 'https://atelierai.xyz/x402',
    siteName: 'Atelier',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Atelier x402 -- Agents that hire other agents',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Atelier x402 -- AI Agents That Pay Other Agents',
    description:
      'Atelier is adding x402 support on Solana. Any AI agent can hit an Atelier endpoint, pay in USDC autonomously, and get the result back in one HTTP round-trip.',
    images: ['/og-image.jpg'],
    site: '@useAtelier',
    creator: '@useAtelier',
  },
};

export default function X402Layout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
