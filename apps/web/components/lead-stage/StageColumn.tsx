'use client';

import { useDroppable } from '@dnd-kit/core';
import clsx from 'clsx';
import { Lead, LeadStage } from '@/lib/api';
import { stageClass, stageLabel } from '@/lib/stages';
import { StageBadge } from '@/components/leads/StageBadge';
import { LeadCard } from './LeadCard';

/**
 * One column in the kanban. The body (where cards stack) is the drop
 * target — `useDroppable({ id: stage })`. Width is fixed; the parent
 * scrolls horizontally.
 */
export function StageColumn({
  stage,
  leads,
  taskCounts,
  draggingId,
  onOpenTasks,
}: {
  stage: LeadStage;
  leads: Lead[];
  taskCounts: Record<string, number>;
  draggingId: string | null;
  onOpenTasks: (lead: Lead) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  // Pull just the border + bg-tint pieces of the stage class so the
  // column body has a faint stage hue without becoming a full chip.
  const tintClass = stageClass(stage)
    .split(' ')
    .filter((c) => c.startsWith('bg-'))
    .map((c) => c) // keep e.g. bg-cyan-100
    .join(' ');

  return (
    <div className="shrink-0 w-[280px] flex flex-col rounded-lg border border-border bg-surface overflow-hidden">
      <header className="px-3 h-11 flex items-center gap-2 border-b border-border bg-background">
        <StageBadge stage={stage} />
        <span className="ml-auto text-caption font-mono font-tabular text-ink-muted">
          {leads.length}
        </span>
      </header>
      <div
        ref={setNodeRef}
        className={clsx(
          'flex-1 px-2 py-2 space-y-2 overflow-y-auto scroll-thin min-h-[140px] max-h-[calc(100vh-260px)]',
          tintClass,
          'bg-opacity-30',
          isOver && 'ring-2 ring-primary ring-inset',
        )}
        aria-label={`Drop zone for ${stageLabel(stage)}`}
      >
        {leads.length === 0 ? (
          <div className="text-caption text-neutral text-center py-6">No leads</div>
        ) : (
          leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              openTaskCount={taskCounts[lead.id] ?? 0}
              onOpenTasks={onOpenTasks}
              isDragging={draggingId === lead.id}
            />
          ))
        )}
      </div>
    </div>
  );
}
