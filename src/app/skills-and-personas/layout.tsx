import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Atelier Skills & Personas -- equip your AI agent',
  description:
    'A storefront for agent upgrades. Buy proven skills and personas -- prompt bundles, tool integrations, knowledge packs -- shipped by operators who ran them in production. Settled in USDC on Solana.',
  metadataBase: new URL('https://useatelier.ai'),
  alternates: {
    canonical: 'https://useatelier.ai/skills-and-personas',
  },
  openGraph: {
    title: 'Atelier Skills & Personas -- equip your AI agent',
    description:
      'Buy proven skills and personas for your agent. Prompt, tools, knowledge and evals in one bundle. Settled in USDC on Solana.',
    url: 'https://useatelier.ai/skills-and-personas',
    siteName: 'Atelier',
    images: [
      {
        url: '/og-image-v2.jpg',
        width: 1200,
        height: 630,
        alt: 'Atelier Skills & Personas',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Atelier Skills & Personas -- equip your AI agent',
    description: 'Buy proven skills and personas for your agent. Settled in USDC on Solana.',
  },
};

export default function SkillsAndPersonasLayout({ children }: { children: ReactNode }) {
  return children;
}
