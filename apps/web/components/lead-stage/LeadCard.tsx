'use client';

import Link from 'next/link';
import { useDraggable } from '@dnd-kit/core';
import clsx from 'clsx';
import { CheckCircle2, Globe, Mail, ListChecks } from 'lucide-react';
import { Lead } from '@/lib/api';
import { stageClass } from '@/lib/stages';

/**
 * Single lead in a kanban column.
 *
 * Three distinct affordances on one card so user intent is unambiguous:
 *  - business-name LINK    → navigate to /leads/:id (does not start a drag)
 *  - tasks ICON button     → open follow-ups drawer for this lead
 *  - card body (drag handle)→ drag to a different stage column
 */
export function LeadCard({
  lead,
  openTaskCount,
  onOpenTasks,
  isDragging: isDraggingProp,
}: {
  lead: Lead;
  openTaskCount: number;
  onOpenTasks: (lead: Lead) => void;
  /** When this card is the dragged one (we render a low-opacity ghost in place). */
  isDragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    data: { stage: lead.stage },
  });

  // Either the local drag state (dnd-kit picked us up) or the page-level
  // isDragging flag (we're the active drag — render the ghost in place).
  const ghosted = isDragging || isDraggingProp;

  const primaryName = lead.ownerName ?? null;
  const primaryEmail = lead.ownerEmail ?? null;
  const cityState = [lead.city, lead.state].filter(Boolean).join(', ');

  return (
    <article
      ref={setNodeRef}
      className={clsx(
        'rounded-lg bg-surface border shadow-e1 transition-shadow',
        'hover:shadow-e2 cursor-grab active:cursor-grabbing select-none',
        ghosted && 'opacity-40',
      )}
      style={{
        // Border tint per stage. Tailwind class strings are listed in
        // stages.ts so the JIT can find them.
      }}
    >
      <div className={clsx('rounded-lg border-l-2', stageClass(lead.stage).split(' ').filter(c => c.startsWith('border-')).join(' '))}>
        {/* Title + tasks icon row */}
        <div className="px-3 pt-2.5 pb-1 flex items-start gap-2">
          <Link
            href={`/leads/${lead.id}`}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 font-medium text-ink hover:text-primary truncate text-bodysm"
            title={lead.businessName}
          >
            {lead.businessName}
          </Link>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenTasks(lead);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={clsx(
              'shrink-0 inline-flex items-center gap-1 h-6 px-1.5 rounded-md',
              openTaskCount > 0
                ? 'bg-primary/10 text-primary'
                : 'text-neutral hover:text-ink hover:bg-background',
            )}
            aria-label="Open follow-ups"
            title="Open follow-ups"
          >
            <ListChecks size={12} />
            {openTaskCount > 0 && (
              <span className="text-[11px] font-mono font-tabular">{openTaskCount}</span>
            )}
          </button>
        </div>

        {/* Drag handle: everything below the title row. We attach the
            listeners to this body so clicks on the title link / tasks
            button still work. */}
        <div ref={undefined} {...listeners} {...attributes} className="px-3 pb-2.5 space-y-1">
          {(primaryName || primaryEmail) && (
            <div className="text-caption text-ink-muted truncate" title={primaryEmail ?? undefined}>
              {primaryName && <span className="text-ink">{primaryName}</span>}
              {primaryName && primaryEmail && <span className="text-neutral"> · </span>}
              {primaryEmail && <span className="font-mono">{primaryEmail}</span>}
            </div>
          )}

          {cityState && (
            <div className="text-caption text-neutral truncate">{cityState}</div>
          )}

          <div className="flex items-center gap-2 pt-0.5">
            {/* Quick-look icons — only shown if the field is set. */}
            {lead.claimed && (
              <CheckCircle2
                size={11}
                className="text-primary"
                aria-label="Claimed"
              />
            )}
            {lead.website && (
              <Globe
                size={11}
                className="text-neutral"
                aria-label="Has website"
              />
            )}
            {lead.email && (
              <Mail
                size={11}
                className="text-neutral"
                aria-label="Has email"
              />
            )}

            {lead.score > 0 && (
              <span className="ml-auto text-[11px] font-mono font-tabular text-ink-muted">
                {lead.score}
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
