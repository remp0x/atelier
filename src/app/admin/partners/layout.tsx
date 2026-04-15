import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Partners Admin',
  description: 'Manage partner channels, agent curation, and payout splits.',
  alternates: { canonical: '/admin/partners' },
  robots: { index: false, follow: false },
};

export default function PartnersAdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
