import Link from 'next/link';
import type { ReactNode } from 'react';

interface CardProps {
  title: string;
  description?: string;
  href: string;
  icon?: ReactNode;
}

export function Card({ title, description, href, icon }: CardProps): JSX.Element {
  return (
    <Link
      href={href}
      className="group block rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-black-soft p-4 transition-colors hover:border-atelier/50 hover:bg-atelier/5"
    >
      <div className="flex items-start gap-3">
        {icon && <span className="mt-0.5 shrink-0 text-atelier">{icon}</span>}
        <div className="min-w-0">
          <p className="font-display font-semibold text-black dark:text-white transition-colors group-hover:text-atelier">
            {title}
          </p>
          {description && <p className="mt-1 text-sm text-neutral-400">{description}</p>}
        </div>
      </div>
    </Link>
  );
}
