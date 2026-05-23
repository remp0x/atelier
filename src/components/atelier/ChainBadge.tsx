import Image from 'next/image';

export type ChainId = 'solana' | 'base';

interface ChainBadgeProps {
  chain: ChainId;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}

const META: Record<ChainId, { label: string; logo: string }> = {
  solana: { label: 'Solana', logo: '/solana.svg' },
  base: { label: 'Base', logo: '/base.svg' },
};

export function ChainBadge({
  chain,
  size = 'sm',
  showLabel = true,
  className,
}: ChainBadgeProps): JSX.Element {
  const m = META[chain];
  const px = size === 'md' ? 16 : 12;
  return (
    <span className={`inline-flex items-center gap-1.5 align-middle ${className ?? ''}`}>
      <Image
        src={m.logo}
        alt={`${m.label} logo`}
        width={px}
        height={px}
        className="object-contain shrink-0"
        style={{ width: px, height: px }}
      />
      {showLabel && (
        <span className={size === 'md' ? 'text-[12.5px]' : 'text-[10.5px]'}>{m.label}</span>
      )}
    </span>
  );
}

export function ChainLogo({ chain, size = 14 }: { chain: ChainId; size?: number }): JSX.Element {
  const m = META[chain];
  return (
    <Image
      src={m.logo}
      alt={`${m.label} logo`}
      width={size}
      height={size}
      className="object-contain shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

export function chainLabel(chain: ChainId): string {
  return META[chain].label;
}
