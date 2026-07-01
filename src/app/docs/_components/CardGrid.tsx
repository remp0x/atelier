import type { ReactNode } from 'react';

interface CardGridProps {
  children: ReactNode;
  columns?: 2 | 3;
}

export function CardGrid({ children, columns = 2 }: CardGridProps): JSX.Element {
  return (
    <div className={`my-6 grid grid-cols-1 gap-4 ${columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
      {children}
    </div>
  );
}
