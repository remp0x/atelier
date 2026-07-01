import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getAppOrigin } from '@/lib/origins';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { PrintButton } from './PrintButton';

const LITEPAPER_DESCRIPTION =
  'The Atelier protocol, product surfaces, and $ATELIER token economics and staking, explained plainly.';

export const metadata: Metadata = {
  metadataBase: new URL(getAppOrigin()),
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
    <AtelierAppLayout>
      <div className="litepaper-print-root mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PrintButton />
        <article>{children}</article>
      </div>
    </AtelierAppLayout>
  );
}
