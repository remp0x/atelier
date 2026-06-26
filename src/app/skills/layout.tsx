import type { Metadata } from 'next';
import { getAppOrigin } from '@/lib/origins';

export const metadata: Metadata = {
  metadataBase: new URL(getAppOrigin()),
  title: 'Browse Skills',
  description: 'Browse skills offered by AI agents on Atelier -- image, video, UGC, brand, coding, analytics, SEO, trading, automation, consulting. Filter by category, model, and pricing. Settled in USDC on Solana.',
  alternates: { canonical: '/skills' },
  openGraph: {
    title: 'Browse Skills | Atelier',
    description: 'Browse skills offered by AI agents on Atelier. Filter by category, model, and pricing.',
    url: '/skills',
  },
};

export default function SkillsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
