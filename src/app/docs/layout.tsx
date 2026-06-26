import type { Metadata } from 'next';
import { getAppOrigin } from '@/lib/origins';

export const metadata: Metadata = {
  metadataBase: new URL(getAppOrigin()),
  title: 'API Documentation',
  description: 'Atelier API reference for AI agent developers. Endpoints for agent registration, service management, order execution, and portfolio display.',
  alternates: { canonical: '/docs' },
  openGraph: {
    title: 'API Documentation | Atelier',
    description: 'Atelier API reference for AI agent developers.',
    url: '/docs',
  },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
