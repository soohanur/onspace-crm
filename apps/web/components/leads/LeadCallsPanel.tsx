'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  api,
  Call,
  CallStatus,
  CreateCallInput,
  Lead,
  UpdateCallInput,
} from '@/lib/api';
import {
  callDialHref,
  directionIcon,
  directionLabel,
  formatDuration,
  outcomeClass,
  outcomeLabel,
  PHONE_INTEGRATION_TOOLTIP,
  statusClass,
  statusLabel,
  whenLabel,
} from '@/lib/calls';
import { Card } from '../ui/Card';
import { SectionHeader } from './LeadOverviewCard';
import { CallFormModal } from '../calls/CallFormModal';
import { CallDetailsModal } from '../calls/CallDetailsModal';
import {
  CalendarPlus,
  CheckCircle2,
  MoreVertical,
  Pencil,
  Phone,
  PhoneCall,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

const TONE: Record<ReturnType<typeof whenLabel>['tone'], string> = {
  past: 'text-error',
  today: 'text-warning',
  future: 'text-ink',
  done: 'text-success',
  muted: 'text-neutral',
};

/**
 * Lead-detail calls panel. Sibling of LeadMeetingsPanel — same shape and
 * idiom. Sort: scheduled first (by occurredAt asc), completed in the
 * middle (by occurredAt desc), cancelled last.
 */
export function LeadCallsPanel({ lead }: { lead: Lead }) {
  const qc = useQueryClient();
  const { data: calls = [] } = useQuery<Call[]>({
    queryKey: ['lead-calls', lead.id],
    queryFn: () => api.listLeadCalls(lead.id),
    initialData: lead.calls,
  });

  const [modal, setModal] = useState<
    | null
    | { mode: 'create'; defaultStatus: 'completed' | 'scheduled' }
    | { mode: 'edit'; call: Call }
  >(null);
  const [detailCall, setDetailCall] = useState<Call | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['lead-calls', lead.id] });
    qc.invalidateQueries({ queryKey: ['lead', lead.id] });
    qc.invalidateQueries({ queryKey: ['lead-tasks', lead.id] });
    qc.invalidateQueries({ queryKey: ['calls-list'] });
    qc.invalidateQueries({ queryKey: ['call-counts'] });
    qc.invalidateQueries({ queryKey: ['tasks-list'] });
    qc.invalidateQueries({ queryKey: ['tasks-count-full'] });
  };

  const create = useMutation({
    mutationFn: (input: CreateCallInput) => api.createCall(input),
    onSuccess: () => {
      setModal(null);
      invalidate();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateCallInput }) =>
      api.updateCall(id, patch),
    onSuccess: () => {
      setModal(null);
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteCall(id),
    onSuccess: invalidate,
  });

  const sorted = [...calls].sort((a, b) => {
    const rank = (c: Call) =>
      c.status === 'scheduled' ? 0 : c.status === 'cancelled' ? 2 : 1;
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    const ta = new Date(a.occurredAt).getTime();
    const tb = new Date(b.occurredAt).getTime();
    return ra === 0 ? ta - tb : tb - ta;
  });

  const totalCount = sorted.length;
  const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const thisWeekCount = sorted.filter(
    (c) =>
      c.status === 'completed' &&
      new Date(c.occurredAt).getTime() >= sevenDaysAgoMs,
  ).length;

  return (
    <Card id="calls">
      <SectionHeader
        icon={<PhoneCall size={14} />}
        title={`Calls (${totalCount} total · ${thisWeekCount} this week)`}
        right={
          <div className="flex items-center gap-3">
            <button
              onClick={() =>
                setModal({ mode: 'create', defaultStatus: 'scheduled' })
              }
              className="text-caption text-primary hover:underline inline-flex items-center gap-1"
            >
              <CalendarPlus size={12} /> Schedule a call
            </button>
            <button
              onClick={() =>
                setModal({ mode: 'create', defaultStatus: 'completed' })
              }
              className="text-caption text-primary hover:underline inline-flex items-center gap-1"
            >
              <Plus size={12} /> Log a call
            </button>
          </div>
        }
      />

      {sorted.length === 0 ? (
        <div className="text-bodysm text-ink-muted py-3">
          No calls logged yet.
        </div>
      ) : (
        <ul className="divide-y divide-border -mx-1">
          {sorted.map((c) => (
            <CallRow
              key={c.id}
              call={c}
              onOpen={() => setDetailCall(c)}
              onEdit={() => setModal({ mode: 'edit', call: c })}
              onComplete={(call) => {
                if (!call.outcome) {
                  setModal({ mode: 'edit', call });
                } else {
                  update.mutate({
                    id: call.id,
                    patch: { status: 'completed' },
                  });
                }
              }}
              onCancel={(call) =>
                update.mutate({ id: call.id, patch: { status: 'cancelled' } })
              }
              onDelete={(call) => {
                if (confirm('Delete this call log?')) remove.mutate(call.id);
              }}
            />
          ))}
        </ul>
      )}

      <CallFormModal
        open={modal !== null}
        initial={modal?.mode === 'edit' ? modal.call : undefined}
        lockedLeadId={lead.id}
        defaultStatus={
          modal?.mode === 'create' ? modal.defaultStatus : undefined
        }
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
            update.mutate({ id: modal.call.id, patch: input });
          } else {
            create.mutate(input);
          }
        }}
      />

      <CallDetailsModal
        call={detailCall}
        onClose={() => setDetailCall(null)}
        onEdit={(c) => {
          setDetailCall(null);
          setModal({ mode: 'edit', call: c });
        }}
        onComplete={(c) => {
          if (!c.outcome) {
            setDetailCall(null);
            setModal({ mode: 'edit', call: c });
          } else {
            update.mutate({ id: c.id, patch: { status: 'completed' } });
            setDetailCall(null);
          }
        }}
        onCancel={(c) => {
          update.mutate({ id: c.id, patch: { status: 'cancelled' } });
          setDetailCall(null);
        }}
        onDelete={(c) => {
          if (confirm('Delete this call log?')) {
            remove.mutate(c.id);
            setDetailCall(null);
          }
        }}
      />
    </Card>
  );
}

function CallRow({
  call,
  onOpen,
  onEdit,
  onComplete,
  onCancel,
  onDelete,
}: {
  call: Call;
  onOpen: () => void;
  onEdit: () => void;
  onComplete: (c: Call) => void;
  onCancel: (c: Call) => void;
  onDelete: (c: Call) => void;
}) {
  const Icon = directionIcon(call.direction);
  const when = whenLabel(call.occurredAt, call.status);
  const dial = callDialHref(call);
  const showDial = !!dial && call.status !== 'cancelled';
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
        <Icon
          size={14}
          className={
            call.direction === 'outbound' ? 'text-primary' : 'text-success'
          }
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onOpen}
            className="text-bodysm font-medium text-ink hover:text-primary text-left truncate"
          >
            {directionLabel(call.direction)} call
            {call.outcome ? ` — ${outcomeLabel(call.outcome).toLowerCase()}` : ''}
          </button>
          <span
            className={clsx(
              'inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium border whitespace-nowrap',
              statusClass(call.status),
            )}
          >
            {statusLabel(call.status)}
          </span>
          {call.outcome && (
            <span
              className={clsx(
                'inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium border whitespace-nowrap',
                outcomeClass(call.outcome),
              )}
            >
              {outcomeLabel(call.outcome)}
            </span>
          )}
          {showDial && (
            <a
              href={dial!}
              title={PHONE_INTEGRATION_TOOLTIP}
              className="inline-flex items-center gap-1 h-5 px-1.5 rounded bg-primary text-white text-[11px] font-medium hover:bg-primary/90 whitespace-nowrap"
            >
              <Phone size={10} />
              Call
            </a>
          )}
        </div>
        <div className="mt-0.5 text-caption flex items-center gap-2 flex-wrap">
          <span className={TONE[when.tone]}>{when.label}</span>
          {call.status === 'completed' && (
            <span className="text-neutral font-mono">
              · {formatDuration(call.durationSec)}
            </span>
          )}
          {call.contact && (
            <span className="text-neutral">with {call.contact.name}</span>
          )}
        </div>
        {call.notes && (
          <div className="text-caption text-ink-muted mt-0.5 line-clamp-1">
            {call.notes}
          </div>
        )}
      </div>
      <div ref={wrapRef} className="relative">
        <button
          onClick={() => setMenuOpen((s) => !s)}
          className="p-1 rounded-md text-neutral hover:text-ink hover:bg-background opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          aria-label="Call actions"
        >
          <MoreVertical size={14} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-1 z-20 bg-surface border border-border rounded-md shadow-e2 min-w-[170px] py-1">
            {call.status === 'scheduled' && (
              <MenuItem
                icon={<CheckCircle2 size={12} />}
                label="Mark completed"
                onClick={() => {
                  setMenuOpen(false);
                  onComplete(call);
                }}
              />
            )}
            {call.status === 'scheduled' && (
              <MenuItem
                icon={<X size={12} />}
                label="Cancel"
                onClick={() => {
                  setMenuOpen(false);
                  onCancel(call);
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
                onDelete(call);
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
