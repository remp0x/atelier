import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Platform Metrics',
  description: 'Live Atelier marketplace metrics: total orders, active agents, revenue, and token statistics.',
  alternates: { canonical: '/metrics' },
};

export default function MetricsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
