'use client';

import Image from 'next/image';

type Item = {
  name: string;
  href: string;
  wordmark?: string;
  icon?: 'pumpfun' | null;
  width?: number;
};

const TRUSTED: Item[] = [
  { name: 'Nemo',      href: '#', wordmark: 'Nemo',      width: 110 },
  { name: 'Juice',     href: '#', wordmark: 'Juice',     width: 110 },
  { name: 'DCA',       href: '#', wordmark: 'DCA',       width: 100 },
  { name: 'ConcaveFi', href: '#', wordmark: 'ConcaveFi', width: 140 },
  { name: 'Mogra',     href: '#', wordmark: 'Mogra',     width: 110 },
  { name: 'AgentGram', href: '#', wordmark: 'AgentGram', width: 150 },
];

const POWERED: Item[] = [
  { name: 'Helius',  href: 'https://helius.dev', wordmark: 'Helius',  width: 130 },
  { name: 'Solana',  href: 'https://solana.com', wordmark: 'Solana',  width: 120 },
  { name: 'PumpFun', href: 'https://pump.fun',   wordmark: 'PumpFun', width: 120 },
  { name: 'SAID',    href: 'https://said.xyz',   wordmark: 'SAID',    width: 110 },
  { name: 'Privy',   href: 'https://privy.io',   wordmark: 'Privy',   width: 120 },
];

function LogoCell({ item }: { item: Item }) {
  return (
    <div
      className="flex-none flex items-center justify-center gap-2 h-full px-5 border-l border-gray-200 dark:border-neutral-800"
      style={{ width: item.width }}
      title={item.name}
    >
      {item.icon === 'pumpfun' && (
        <Image
          src="/pumpfun-icon.png"
          alt=""
          width={14}
          height={14}
          className="w-3.5 h-3.5 rounded-sm opacity-70"
        />
      )}
      <span className="font-display font-semibold text-[13px] text-gray-500 dark:text-neutral-400 tracking-tight whitespace-nowrap">
        {item.wordmark ?? item.name}
      </span>
    </div>
  );
}

function MarqueeRow({
  items,
  duration,
  reverse = false,
}: {
  items: Item[];
  duration: number;
  reverse?: boolean;
}) {
  const loop = [...items, ...items, ...items, ...items];
  return (
    <div
      className="relative overflow-hidden h-11"
      style={{
        maskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)',
        WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)',
      }}
    >
      <div
        className="flex h-full"
        style={{
          width: 'max-content',
          animation: `trustedMarquee ${duration}s linear infinite ${reverse ? 'reverse' : ''}`,
        }}
      >
        {loop.map((it, i) => (
          <LogoCell key={`${it.name}-${i}`} item={it} />
        ))}
      </div>
      <style jsx>{`
        @keyframes trustedMarquee {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  );
}

export function TrustedPoweredBy() {
  return (
    <div className="inline-flex items-center gap-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-gray-400 dark:text-neutral-500 w-[110px] shrink-0 leading-[1.3]">
        Trusted &amp;
        <br />
        Powered By
      </div>
      <div className="w-[420px]">
        <MarqueeRow items={TRUSTED} duration={140} />
        <div className="border-t border-gray-200 dark:border-neutral-800">
          <MarqueeRow items={POWERED} duration={180} reverse />
        </div>
      </div>
    </div>
  );
}
