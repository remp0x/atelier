import { Children, type ReactNode } from 'react';

interface StepProps {
  title: string;
  children: ReactNode;
}

export function Step({ title, children }: StepProps): JSX.Element {
  return (
    <div>
      <h4 className="mb-1 font-display font-semibold text-black dark:text-white">{title}</h4>
      <div className="space-y-2 text-sm text-neutral-400 [&>p]:mb-0">{children}</div>
    </div>
  );
}

interface StepsProps {
  children: ReactNode;
}

export function Steps({ children }: StepsProps): JSX.Element {
  const items = Children.toArray(children);

  return (
    <ol className="my-6 space-y-6">
      {items.map((child, index) => (
        <li key={index} className="flex gap-4">
          <div className="flex flex-col items-center">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-atelier/40 bg-atelier/10 font-mono text-xs font-bold text-atelier">
              {index + 1}
            </span>
            {index < items.length - 1 && <span className="mt-1 w-px flex-1 bg-gray-200 dark:bg-neutral-800" />}
          </div>
          <div className="min-w-0 flex-1 pb-1">{child}</div>
        </li>
      ))}
    </ol>
  );
}
