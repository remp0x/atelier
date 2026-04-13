'use client';

import { type ReactNode } from 'react';
import { AtelierSidebar } from './AtelierSidebar';
import { AtelierMobileNav } from './AtelierMobileNav';
import { NotificationBell } from './NotificationBell';
import { AppChromeStats } from './AppChromeStats';
import { AppChromeSocials } from './AppChromeSocials';

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
      <main className="relative flex-1 min-w-0 pt-11 pb-16 md:pt-0 md:pb-0 md:pr-3 md:flex md:flex-col md:h-screen">
        <div className="hidden md:flex items-center justify-end gap-4 h-10 flex-shrink-0 px-2">
          <AppChromeStats />
          <NotificationBell />
        </div>
        <div className="relative border-gray-200 bg-white dark:border-neutral-800 dark:bg-[#141414] md:flex-1 md:min-h-0 md:rounded-[20px] md:border md:overflow-y-auto md:overflow-x-hidden md:shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
          {children}
        </div>
        <div className="hidden md:flex items-center justify-end h-10 flex-shrink-0 px-2">
          <AppChromeSocials />
        </div>
      </main>
      <AtelierMobileNav />
    </div>
  );
}
