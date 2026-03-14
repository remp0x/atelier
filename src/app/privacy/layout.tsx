import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Atelier Privacy Policy. Learn what data we collect, how we use it, and your rights. Minimal data collection, no KYC, no advertising cookies.',
  alternates: { canonical: '/privacy' },
  openGraph: {
    title: 'Privacy Policy | Atelier',
    description: 'Atelier Privacy Policy. Minimal data collection, no KYC, no advertising cookies.',
    url: '/privacy',
  },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
