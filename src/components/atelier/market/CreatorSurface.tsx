'use client';

import { PublishSkillForm } from './PublishSkillForm';

export function CreatorSurface(): JSX.Element {
  return (
    <section
      id="become-a-creator"
      className="relative overflow-hidden border-t border-gray-200 dark:border-neutral-900 py-14 md:py-20"
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -inset-[10%]"
          style={{
            filter: 'blur(12px)',
            background: `
              radial-gradient(ellipse 70% 60% at 50% 100%, rgba(250,76,20,0.18), transparent 62%),
              radial-gradient(ellipse 50% 40% at 15% 90%, rgba(201,58,10,0.12), transparent 58%),
              radial-gradient(ellipse 50% 40% at 85% 85%, rgba(255,122,61,0.10), transparent 58%)
            `,
          }}
        />
      </div>

      <div className="relative max-w-[1180px] mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] gap-10 lg:gap-14 items-start">
          <div className="lg:sticky lg:top-24">
            <p className="font-mono text-[11px] font-semibold tracking-[0.18em] text-atelier mb-3">
              FOR CREATORS
            </p>
            <h2
              className="font-display font-extrabold tracking-[-0.03em] leading-[1.05] mb-4"
              style={{ fontSize: 'clamp(1.625rem, 3.2vw, 2.375rem)' }}
            >
              Got a workflow that ships?{' '}
              <span className="text-gradient-atelier">Publish it.</span>
            </h2>
            <p className="text-[14.5px] md:text-[15.5px] leading-[1.55] text-gray-700 dark:text-neutral-300 mb-3">
              You spent weeks perfecting that workflow. Now let it pay you back.
            </p>
            <p className="text-[14.5px] md:text-[15.5px] leading-[1.55] text-gray-700 dark:text-neutral-300 mb-6">
              Upload your skill, pick a category, set a price. Every install earns you USDC.
            </p>
            <ul className="space-y-3 text-[13.5px] leading-[1.55] text-gray-700 dark:text-neutral-300">
              <InfoItem>
                <span className="text-black dark:text-white font-semibold">Upload once, earn forever.</span>
              </InfoItem>
              <InfoItem>
                <span className="text-black dark:text-white font-semibold">Keep 100% of every sale.</span>{' '}
                Paid peer-to-peer in USDC, straight to your wallet. Atelier takes nothing.
              </InfoItem>
              <InfoItem>
                <span className="text-black dark:text-white font-semibold">No exclusivity.</span>{' '}
                Keep selling it wherever you want.
              </InfoItem>
            </ul>
          </div>

          <PublishSkillForm />
        </div>
      </div>
    </section>
  );
}

function InfoItem({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <li className="flex items-start gap-2.5">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className="w-4 h-4 mt-0.5 text-atelier shrink-0"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
      <span>{children}</span>
    </li>
  );
}
