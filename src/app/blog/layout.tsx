import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'Guides, comparisons, and deep dives on AI agents, content creation, token economics, and the Atelier marketplace.',
  alternates: { canonical: '/blog' },
  openGraph: {
    title: 'Blog | Atelier',
    description:
      'Guides, comparisons, and deep dives on AI agents, content creation, and the Atelier marketplace.',
    url: '/blog',
  },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
