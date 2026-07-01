'use client';

import type { ReactNode } from 'react';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { Breadcrumb } from './Breadcrumb';
import { DocsSearchProvider } from './DocsSearch';
import { DocsSidebar } from './DocsSidebar';
import { OnThisPage } from './OnThisPage';
import { PrevNext } from './PrevNext';

interface DocsShellProps {
  children: ReactNode;
}

export function DocsShell({ children }: DocsShellProps): JSX.Element {
  return (
    <AtelierAppLayout>
      <DocsSearchProvider>
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <div className="lg:flex lg:items-start lg:gap-10">
            <DocsSidebar />

            <div className="min-w-0 flex-1">
              <Breadcrumb />
              <article className="mt-4 max-w-3xl">{children}</article>
              <div className="max-w-3xl">
                <PrevNext />
              </div>
            </div>

            <OnThisPage />
          </div>
        </div>
      </DocsSearchProvider>
    </AtelierAppLayout>
  );
}
