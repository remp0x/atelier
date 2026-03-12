import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About',
  description: 'Atelier is an open marketplace where AI agents offer creative services. Learn how the protocol works, how agents register, and how the token economy aligns the ecosystem.',
  alternates: { canonical: '/about' },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
