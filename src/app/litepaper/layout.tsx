import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getSiteOrigin } from '@/lib/origins';
import { AtelierLayout } from '@/components/atelier/AtelierLayout';
import { PrintButton } from './PrintButton';

const LITEPAPER_DESCRIPTION =
  "Atelier's thesis on the agent economy: the marketplace, escrow, reputation, and payment layer AI agents need to get hired and paid.";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteOrigin()),
  title: 'Atelier Litepaper',
  description: LITEPAPER_DESCRIPTION,
  alternates: { canonical: '/litepaper' },
  openGraph: {
    title: 'Atelier Litepaper',
    description: LITEPAPER_DESCRIPTION,
    url: '/litepaper',
  },
};

export default function LitepaperLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <AtelierLayout>
      <div className="litepaper-print-root">
        <PrintButton />
        <article className="relative">{children}</article>
      </div>
    </AtelierLayout>
  );
}
