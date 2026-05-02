'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  api,
  CreateMeetingInput,
  Lead,
  Meeting,
  UpdateMeetingInput,
} from '@/lib/api';
import {
  meetingStatusClass,
  meetingStatusLabel,
  meetingTypeIcon,
  meetingTypeLabel,
  whenLabel,
} from '@/lib/meetings';
import { Card } from '../ui/Card';
import { SectionHeader } from './LeadOverviewCard';
import { MeetingFormModal } from '../meetings/MeetingFormModal';
import {
  Calendar,
  CheckCircle2,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

const TONE_CLASSES: Record<
  ReturnType<typeof whenLabel>['tone'],
  string
> = {
  past: 'text-error',
  today: 'text-warning',
  future: 'text-ink',
  done: 'text-success',
  muted: 'text-neutral',
};

/**
 * Lead-detail meetings panel. Sibling of LeadTasksPanel — both surface
 * actionable, lead-scoped work surfaces. Sorted: scheduled first
 * (by scheduledAt asc), past in the middle (by scheduledAt desc),
 * cancelled last.
 */
export function LeadMeetingsPanel({ lead }: { lead: Lead }) {
  const qc = useQueryClient();
  const { data: meetings = [] } = useQuery<Meeting[]>({
    queryKey: ['lead-meetings', lead.id],
    queryFn: () => api.listLeadMeetings(lead.id),
    initialData: lead.meetings,
  });

  const [modal, setModal] = useState<
    | null
    | { mode: 'create' }
    | { mode: 'edit'; meeting: Meeting }
  >(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['lead-meetings', lead.id] });
    qc.invalidateQueries({ queryKey: ['lead', lead.id] });
    qc.invalidateQueries({ queryKey: ['lead-tasks', lead.id] });
    qc.invalidateQueries({ queryKey: ['meetings-list'] });
    qc.invalidateQueries({ queryKey: ['meetings-counts'] });
    qc.invalidateQueries({ queryKey: ['tasks-list'] });
    qc.invalidateQueries({ queryKey: ['tasks-count-full'] });
  };

  const create = useMutation({
    mutationFn: (input: CreateMeetingInput) => api.createMeeting(input),
    onSuccess: () => {
      setModal(null);
      invalidate();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateMeetingInput }) =>
      api.updateMeeting(id, patch),
    onSuccess: () => {
      setModal(null);
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteMeeting(id),
    onSuccess: invalidate,
  });

  const sorted = [...meetings].sort((a, b) => {
    const rank = (m: Meeting) =>
      m.status === 'scheduled' ? 0 : m.status === 'cancelled' ? 2 : 1;
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    const ta = new Date(a.scheduledAt).getTime();
    const tb = new Date(b.scheduledAt).getTime();
    // scheduled: ascending; past/cancelled: descending
    return ra === 0 ? ta - tb : tb - ta;
  });

  const upcomingCount = sorted.filter(
    (m) => m.status === 'scheduled' && new Date(m.scheduledAt) >= new Date(),
  ).length;

  return (
    <Card>
      <SectionHeader
        icon={<Calendar size={14} />}
        title={`Meetings (${upcomingCount} upcoming · ${sorted.length} total)`}
        right={
          <button
            onClick={() => setModal({ mode: 'create' })}
            className="text-caption text-primary hover:underline inline-flex items-center gap-1"
          >
            <Plus size={12} /> Schedule meeting
          </button>
        }
      />

      {sorted.length === 0 ? (
        <div className="text-bodysm text-ink-muted py-3">
          No meetings scheduled yet.
        </div>
      ) : (
        <ul className="divide-y divide-border -mx-1">
          {sorted.map((m) => (
            <MeetingRow
              key={m.id}
              meeting={m}
              onEdit={() => setModal({ mode: 'edit', meeting: m })}
              onComplete={() =>
                update.mutate({ id: m.id, patch: { status: 'completed' } })
              }
              onCancel={() =>
                update.mutate({ id: m.id, patch: { status: 'cancelled' } })
              }
              onDelete={() => {
                if (confirm(`Delete meeting "${m.title}"?`)) remove.mutate(m.id);
              }}
            />
          ))}
        </ul>
      )}

      <MeetingFormModal
        open={modal !== null}
        initial={modal?.mode === 'edit' ? modal.meeting : undefined}
        lockedLeadId={lead.id}
        pending={create.isPending || update.isPending}
        error={
          create.error
            ? (create.error as Error).message
            : update.error
            ? (update.error as Error).message
            : null
        }
        onClose={() => setModal(null)}
        onSubmit={(input) => {
          if (modal?.mode === 'edit') {
            update.mutate({ id: modal.meeting.id, patch: input });
          } else {
            create.mutate(input);
          }
        }}
      />
    </Card>
  );
}

function MeetingRow({
  meeting,
  onEdit,
  onComplete,
  onCancel,
  onDelete,
}: {
  meeting: Meeting;
  onEdit: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const TypeIcon = meetingTypeIcon(meeting.type);
  const when = whenLabel(meeting.scheduledAt, meeting.status);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <li className="px-1 py-2.5 group flex items-start gap-2">
      <div className="mt-1 shrink-0">
        <TypeIcon size={14} className="text-ink-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onEdit}
            className="text-bodysm font-medium text-ink hover:text-primary text-left truncate"
          >
            {meeting.title}
          </button>
          <span
            className={clsx(
              'inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium border whitespace-nowrap',
              meetingStatusClass(meeting.status),
            )}
          >
            {meetingStatusLabel(meeting.status)}
          </span>
        </div>
        <div className="mt-0.5 text-caption flex items-center gap-2 flex-wrap">
          <span className={TONE_CLASSES[when.tone]}>{when.label}</span>
          <span className="text-neutral">
            · {meetingTypeLabel(meeting.type)} · {meeting.durationMin}m
          </span>
          {meeting.contact && (
            <span className="text-neutral">with {meeting.contact.name}</span>
          )}
        </div>
        {meeting.notes && (
          <div className="text-caption text-ink-muted mt-0.5 line-clamp-2">
            {meeting.notes}
          </div>
        )}
      </div>
      <div ref={wrapRef} className="relative">
        <button
          onClick={() => setMenuOpen((s) => !s)}
          className="p-1 rounded-md text-neutral hover:text-ink hover:bg-background opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          aria-label="Meeting actions"
        >
          <MoreVertical size={14} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-1 z-20 bg-surface border border-border rounded-md shadow-e2 min-w-[170px] py-1">
            {meeting.status === 'scheduled' && (
              <MenuItem
                icon={<CheckCircle2 size={12} />}
                label="Mark completed"
                onClick={() => {
                  setMenuOpen(false);
                  onComplete();
                }}
              />
            )}
            {meeting.status === 'scheduled' && (
              <MenuItem
                icon={<X size={12} />}
                label="Cancel"
                onClick={() => {
                  setMenuOpen(false);
                  onCancel();
                }}
              />
            )}
            <MenuItem
              icon={<Pencil size={12} />}
              label="Edit"
              onClick={() => {
                setMenuOpen(false);
                onEdit();
              }}
            />
            <MenuItem
              icon={<Trash2 size={12} />}
              label="Delete"
              destructive
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
            />
          </div>
        )}
      </div>
    </li>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-2 px-3 h-8 text-bodysm text-left hover:bg-background',
        destructive ? 'text-error' : 'text-ink',
      )}
    >
      <span className={destructive ? 'text-error' : 'text-neutral'}>{icon}</span>
      {label}
    </button>
  );
}
