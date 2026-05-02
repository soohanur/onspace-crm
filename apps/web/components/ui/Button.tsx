'use client';

import clsx from 'clsx';
import { ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(
          'h-11 px-5 rounded-md font-bold text-[15px] inline-flex items-center justify-center gap-2 transition-colors min-w-[100px] disabled:opacity-40 disabled:pointer-events-none',
          variant === 'primary' &&
            'bg-primary text-white hover:bg-primary-hover',
          variant === 'secondary' &&
            'bg-surface text-ink border border-border hover:border-primary hover:text-primary',
          variant === 'ghost' && 'bg-transparent text-primary hover:bg-primary/10',
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
