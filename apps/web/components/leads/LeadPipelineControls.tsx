'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  api,
  FollowUpStatus,
  Lead,
  LeadStage,
  LeadValidity,
} from '@/lib/api';
import { LEAD_STAGES, stageClass, stageLabel } from '@/lib/stages';
import {
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from 'lucide-react';

const SAVE_DEBOUNCE_MS = 300;

/**
 * Stage picker + score input + validity toggle. Each control debounces
 * (300 ms) and invalidates ['lead', id] on success.
 */
export function LeadPipelineControls({ lead }: { lead: Lead }) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['lead', lead.id] });
    qc.invalidateQueries({ queryKey: ['leads-global'] });
  };

  const stageMut = useMutation({
    mutationFn: (stage: LeadStage) => api.updateLeadStage(lead.id, stage),
    onSuccess: invalidate,
  });
  const scoreMut = useMutation({
    mutationFn: (score: number) => api.updateLeadScore(lead.id, score),
    onSuccess: invalidate,
  });
  const validityMut = useMutation({
    mutationFn: (v: LeadValidity) => api.updateLeadValidity(lead.id, v),
    onSuccess: invalidate,
  });

  // Score is debounced because the user may drag/scrub the number.
  const [scoreDraft, setScoreDraft] = useState<string>(String(lead.score));
  useEffect(() => setScoreDraft(String(lead.score)), [lead.score]);
  useEffect(() => {
    const n = Number(scoreDraft);
    if (
      !Number.isFinite(n) ||
      n < 0 ||
      n > 100 ||
      n === lead.score
    ) {
      return;
    }
    const t = setTimeout(() => scoreMut.mutate(Math.round(n)), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreDraft]);

  return (
    <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-border">
      <div className="flex items-center gap-2">
        <span className="text-caption uppercase tracking-wider text-neutral">
          Stage
        </span>
        <StagePicker
          value={lead.stage}
          onChange={(s) => stageMut.mutate(s)}
          pending={stageMut.isPending}
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-caption uppercase tracking-wider text-neutral">
          Score
        </span>
        <input
          type="number"
          min={0}
          max={100}
          value={scoreDraft}
          onChange={(e) => setScoreDraft(e.target.value)}
          onBlur={() => {
            const n = Number(scoreDraft);
            if (!Number.isFinite(n)) setScoreDraft(String(lead.score));
            else if (n < 0) setScoreDraft('0');
            else if (n > 100) setScoreDraft('100');
          }}
          className="h-8 w-16 px-2 text-bodysm font-mono font-tabular rounded-md border border-border bg-surface focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition"
        />
        <span className="text-caption text-neutral">/100</span>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <span className="text-caption uppercase tracking-wider text-neutral">
          Validity
        </span>
        <ValidityToggle
          value={lead.validity}
          onChange={(v) => validityMut.mutate(v)}
          pending={validityMut.isPending}
        />
        <FollowUpStatusBadge status={lead.followUpStatus} />
      </div>
    </div>
  );
}

const FOLLOWUP_BADGE: Record<
  FollowUpStatus,
  { label: string; className: string }
> = {
  none: {
    label: 'No follow-up',
    className: 'bg-background text-neutral border-border',
  },
  needed: {
    label: 'Follow-up needed',
    className: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  scheduled: {
    label: 'Follow-up scheduled',
    className: 'bg-primary/10 text-primary border-primary/20',
  },
  completed: {
    label: 'Follow-up completed',
    className: 'bg-success/10 text-success border-success/20',
  },
  overdue: {
    label: 'Follow-up overdue',
    className: 'bg-error/10 text-error border-error/20',
  },
};

/**
 * Read-only chip mirroring `lead.followUpStatus`. The status itself is
 * recomputed server-side from the lead's tasks — the user manages it
 * indirectly via the Tasks panel below.
 */
function FollowUpStatusBadge({ status }: { status: FollowUpStatus }) {
  const cfg = FOLLOWUP_BADGE[status];
  return (
    <span
      title="This is auto-managed from the lead's tasks. Add or update follow-ups in the Tasks panel below."
      className={clsx(
        'inline-flex items-center gap-1 h-8 px-2 rounded-md border text-[12px] font-medium whitespace-nowrap',
        cfg.className,
      )}
    >
      <Clock size={12} /> {cfg.label}
    </span>
  );
}

function StagePicker({
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

function ValidityToggle({
  value,
  onChange,
  pending,
}: {
  value: LeadValidity;
  onChange: (v: LeadValidity) => void;
  pending?: boolean;
}) {
  return (
    <div
      className={clsx(
        'inline-flex border border-border rounded-md overflow-hidden text-caption',
        pending && 'opacity-60',
      )}
    >
      <button
        type="button"
        onClick={() => value !== 'valid' && onChange('valid')}
        className={clsx(
          'inline-flex items-center gap-1 px-2.5 h-8 transition-colors',
          value === 'valid'
            ? 'bg-success text-white'
            : 'bg-surface text-ink-muted hover:bg-background',
        )}
      >
        <CheckCircle2 size={12} /> Valid
      </button>
      <button
        type="button"
        onClick={() => value !== 'invalid' && onChange('invalid')}
        className={clsx(
          'inline-flex items-center gap-1 px-2.5 h-8 transition-colors border-l border-border',
          value === 'invalid'
            ? 'bg-error text-white'
            : 'bg-surface text-ink-muted hover:bg-background',
        )}
      >
        <AlertTriangle size={12} /> Invalid
      </button>
    </div>
  );
}
