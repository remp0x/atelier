'use client';

import type { ReactNode } from 'react';
import { AtelierLayout } from '@/components/atelier/AtelierLayout';
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
    <AtelierLayout>
      <DocsSearchProvider>
        <div className="mx-auto max-w-[1400px] px-4 pt-20 pb-10 sm:px-6 lg:px-10 lg:pt-24 lg:pb-16">
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
    </AtelierLayout>
  );
}
