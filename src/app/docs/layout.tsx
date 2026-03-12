import type { Metadata } from 'next';

export const metadata: Metadata = {
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
