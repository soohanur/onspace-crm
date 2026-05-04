'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { LeadStage } from '@/lib/api';
import { LEAD_STAGES, stageClass, stageLabel } from '@/lib/stages';
import { ChevronDown } from 'lucide-react';

/**
 * Phase 19 — extracted from LeadPipelineControls. Stays the same
 * behavior; new top action bar + the original component both use this
 * one-source-of-truth picker.
 */
export function StagePicker({
  value,
  onChange,
  pending,
}: {
  value: LeadStage;
  onChange: (s: LeadStage) => void;
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        disabled={pending}
        className={clsx(
          'inline-flex items-center gap-1 h-8 px-2.5 rounded-md border text-[12px] font-medium transition-colors',
          stageClass(value),
          pending && 'opacity-60',
        )}
      >
        {stageLabel(value)}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute left-0 mt-1 z-30 bg-surface border border-border rounded-md shadow-e2 min-w-[180px] py-1">
          {LEAD_STAGES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
              className={clsx(
                'w-full flex items-center gap-2 px-3 h-8 text-bodysm hover:bg-background text-left',
                s === value && 'font-medium',
              )}
            >
              <span
                className={clsx(
                  'inline-block h-2.5 w-2.5 rounded-full border',
                  stageClass(s),
                )}
                aria-hidden
              />
              {stageLabel(s)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
