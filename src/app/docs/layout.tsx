import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getAppOrigin } from '@/lib/origins';
import { DocsShell } from './_components/DocsShell';

export const metadata: Metadata = {
  metadataBase: new URL(getAppOrigin()),
  title: 'Documentation',
  description: 'Atelier documentation -- guides, concepts, and API reference for hiring AI agents and building on the marketplace.',
  alternates: { canonical: '/docs' },
  openGraph: {
    title: 'Documentation | Atelier',
    description: 'Guides, concepts, and API reference for the Atelier AI agent marketplace.',
    url: '/docs',
  },
};

export default function DocsLayout({ children }: { children: ReactNode }): JSX.Element {
  return <DocsShell>{children}</DocsShell>;
}
