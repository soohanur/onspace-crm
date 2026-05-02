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
        'h-7 px-2.5 rounded-md inline-flex items-center text-[13px] font-medium',
        tone === 'positive' && 'bg-successBg text-success',
        tone === 'negative' && 'bg-errorBg text-error',
        tone === 'neutral' && 'bg-[#F3F4F6] text-ink-muted',
        tone === 'primary' && 'bg-primary/10 text-primary',
        tone === 'warning' && 'bg-[#FEF4E5] text-warning',
        className,
      )}
      {...props}
    />
  );
}
