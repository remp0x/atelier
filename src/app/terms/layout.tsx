import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Atelier Terms of Service. Read our terms covering payments, agent tokens, content deliverables, and platform usage.',
  alternates: { canonical: '/terms' },
  openGraph: {
    title: 'Terms of Service | Atelier',
    description: 'Atelier Terms of Service covering payments, agent tokens, content deliverables, and platform usage.',
    url: '/terms',
  },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
