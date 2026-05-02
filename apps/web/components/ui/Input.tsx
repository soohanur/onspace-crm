'use client';

import clsx from 'clsx';
import { InputHTMLAttributes, forwardRef } from 'react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={clsx(
        'h-11 w-full px-3.5 rounded-md border border-border bg-surface text-[15px] text-ink placeholder:text-neutral focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
