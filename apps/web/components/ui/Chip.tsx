import clsx from 'clsx';
import { HTMLAttributes } from 'react';

type Tone = 'positive' | 'negative' | 'neutral' | 'primary' | 'warning';

export function Chip({
  tone = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={clsx(
        'h-7 px-2.5 rounded-md inline-flex items-center text-[13px] font-medium border',
        tone === 'positive' &&
          'bg-successBg text-success border-success/20 dark:bg-success/15 dark:text-success dark:border-success/30',
        tone === 'negative' &&
          'bg-errorBg text-error border-error/20 dark:bg-error/15 dark:text-error dark:border-error/30',
        tone === 'neutral' &&
          'bg-[#F3F4F6] text-ink-muted border-border dark:bg-surface-2 dark:text-ink-muted dark:border-border',
        tone === 'primary' &&
          'bg-primary/10 text-primary border-primary/20 dark:bg-primary/15 dark:text-primary dark:border-primary/30',
        tone === 'warning' &&
          'bg-[#FEF4E5] text-warning border-warning/20 dark:bg-warning/15 dark:text-warning dark:border-warning/30',
        className,
      )}
      {...props}
    />
  );
}
