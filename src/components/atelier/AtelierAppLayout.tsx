'use client';

import { Suspense, type ReactNode } from 'react';
import { AtelierSidebar } from './AtelierSidebar';
import { AtelierMobileNav } from './AtelierMobileNav';
import { NotificationBell } from './NotificationBell';
import { AppChromeStats } from './AppChromeStats';
import { AppChromeSocials } from './AppChromeSocials';
import { ChromeSearch } from './ChromeSearch';
import { SignInButton } from './SignInButton';

export function AtelierAppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen bg-[#f3f4f6] dark:bg-black text-black dark:text-white transition-colors">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="
            [--white-gradient:repeating-linear-gradient(100deg,var(--white)_0%,var(--white)_7%,var(--transparent)_10%,var(--transparent)_12%,var(--white)_16%)]
            [--dark-gradient:repeating-linear-gradient(100deg,var(--black)_0%,var(--black)_7%,var(--transparent)_10%,var(--transparent)_12%,var(--black)_16%)]
            [--aurora:repeating-linear-gradient(100deg,var(--aurora-1)_10%,var(--aurora-2)_15%,var(--aurora-3)_20%,var(--aurora-4)_25%,var(--aurora-5)_30%)]
            [background-image:var(--white-gradient),var(--aurora)]
            dark:[background-image:var(--dark-gradient),var(--aurora)]
            [background-size:300%,_200%]
            [background-position:50%_50%,50%_50%]
            filter blur-[10px] invert dark:invert-0
            after:content-[''] after:absolute after:inset-0
            after:[background-image:var(--white-gradient),var(--aurora)]
            after:dark:[background-image:var(--dark-gradient),var(--aurora)]
            after:[background-size:200%,_100%]
            after:animate-aurora after:[background-attachment:fixed] after:mix-blend-difference
            absolute -inset-[10px] opacity-20 will-change-transform
            [mask-image:radial-gradient(ellipse_at_100%_0%,black_10%,var(--transparent)_70%)]
          "
        />
      </div>
      <AtelierSidebar />
      <main className="relative flex-1 min-w-0 pt-11 pb-16 md:pt-0 md:pb-0 md:flex md:flex-col md:h-screen">
        <div className="hidden md:flex items-center gap-3 h-14 flex-shrink-0 px-3">
          <Suspense fallback={<div className="flex-1 max-w-2xl h-9" />}>
            <ChromeSearch />
          </Suspense>
          <div className="ml-auto flex items-center gap-3">
            <NotificationBell />
            <SignInButton hideWhen="authenticated" compact />
          </div>
        </div>
        <div className="relative bg-white dark:bg-[#141414] border-gray-200 dark:border-neutral-900 md:flex-1 md:min-h-0 md:overflow-y-auto md:overflow-x-hidden md:border-y">
          {children}
        </div>
        <div className="hidden md:flex items-center justify-between h-10 flex-shrink-0 px-2 gap-4">
          <AppChromeStats />
          <AppChromeSocials />
        </div>
      </main>
      <AtelierMobileNav />
    </div>
  );
}
