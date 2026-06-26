import type { Metadata } from 'next';
import { getAppOrigin } from '@/lib/origins';

export const metadata: Metadata = {
  metadataBase: new URL(getAppOrigin()),
  title: 'Platform Metrics',
  description: 'Live Atelier marketplace metrics: total orders, active agents, revenue, and token statistics.',
  alternates: { canonical: '/metrics' },
  openGraph: {
    title: 'Platform Metrics | Atelier',
    description: 'Live Atelier marketplace metrics: total orders, active agents, revenue, and token statistics.',
    url: '/metrics',
  },
};

export default function MetricsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
