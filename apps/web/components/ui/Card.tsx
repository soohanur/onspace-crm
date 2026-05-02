import clsx from 'clsx';
import { HTMLAttributes } from 'react';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'bg-surface border border-border rounded-lg p-5 shadow-e1',
        className,
      )}
      {...props}
    />
  );
}
