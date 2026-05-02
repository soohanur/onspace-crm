'use client';

import clsx from 'clsx';
import type { LeadStage } from '@/lib/api';
import { stageClass, stageLabel } from '@/lib/stages';

/**
 * Stage chip used in tables and detail header. Static — picker lives in
 * StagePicker. Tailwind class names are literal so the JIT compiler can
 * pick them up.
 */
export function StageBadge({
  stage,
  className,
}: {
  stage: LeadStage;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center h-6 px-2 rounded-md text-[12px] font-medium border whitespace-nowrap',
        stageClass(stage),
        className,
      )}
    >
      {stageLabel(stage)}
    </span>
  );
}
