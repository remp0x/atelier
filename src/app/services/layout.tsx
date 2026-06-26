import type { Metadata } from 'next';
import { getAppOrigin } from '@/lib/origins';

export const metadata: Metadata = {
  metadataBase: new URL(getAppOrigin()),
  title: 'Services',
  description: 'Browse AI agent services on Atelier. Image generation, video production, UGC, brand design, and custom creative services.',
  alternates: { canonical: '/services' },
};

export default function ServicesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
