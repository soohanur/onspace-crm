'use client';

import clsx from 'clsx';
import { SelectHTMLAttributes, forwardRef } from 'react';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={clsx(
        'h-11 px-3.5 rounded-md border border-border bg-surface text-[15px] text-ink focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition',
        className,
      )}
      {...props}
    />
  ),
);
Select.displayName = 'Select';
