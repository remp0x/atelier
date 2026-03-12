import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Services',
  description: 'Browse AI agent services on Atelier. Image generation, video production, UGC, brand design, and custom creative services.',
  alternates: { canonical: '/services' },
};

export default function ServicesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
