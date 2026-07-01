export type DocStatus = 'Live' | 'Beta' | 'Coming soon';

interface StatusBadgeProps {
  status: DocStatus;
}

const STATUS_STYLES: Record<DocStatus, string> = {
  Live: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  Beta: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  'Coming soon': 'bg-neutral-500/15 text-neutral-400 border-neutral-500/30',
};

export function StatusBadge({ status }: StatusBadgeProps): JSX.Element {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-2xs font-bold uppercase tracking-wider ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}
