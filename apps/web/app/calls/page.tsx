'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Suspense, useMemo, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  api,
  Call,
  CallBucket,
  CallDirection,
  CallOutcome,
  CreateCallInput,
  UpdateCallInput,
} from '@/lib/api';
import {
  CALL_BUCKETS,
  CALL_DIRECTIONS,
  CALL_OUTCOMES,
  bucketLabel,
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
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StageBadge } from '@/components/leads/StageBadge';
import { LeadTypeahead } from '@/components/tasks/LeadTypeahead';
import { CallFormModal } from '@/components/calls/CallFormModal';
import { CallDetailsModal } from '@/components/calls/CallDetailsModal';
import {
  CalendarPlus,
  CheckCircle2,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
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

export default function CallsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-[1400px] mx-auto px-6 py-8 text-ink-muted">
          Loading…
        </div>
      }
    >
      <Body />
    </Suspense>
  );
}

function Body() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const qc = useQueryClient();

  const trashView = sp.get('trash') === '1';
  const bucket: CallBucket =
    (sp.get('bucket') as CallBucket) &&
    CALL_BUCKETS.includes(sp.get('bucket') as CallBucket)
      ? (sp.get('bucket') as CallBucket)
      : 'today';
  const directionCsv = sp.get('direction') ?? '';
  const directions = directionCsv
    .split(',')
    .filter((d): d is CallDirection =>
      CALL_DIRECTIONS.includes(d as CallDirection),
    );
  const outcomeCsv = sp.get('outcome') ?? '';
  const outcomes = outcomeCsv
    .split(',')
    .filter((o): o is CallOutcome => CALL_OUTCOMES.includes(o as CallOutcome));
  const leadId = sp.get('lead') ?? undefined;

  const updateUrl = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === '') p.delete(k);
      else p.set(k, v);
    }
    router.replace(p.toString() ? `${pathname}?${p.toString()}` : pathname);
  };

  const queryParams = useMemo(
    () =>
      trashView
        ? {
            trash: true as const,
            direction: directions.length ? directions : undefined,
            outcome: outcomes.length ? outcomes : undefined,
            leadId,
          }
        : {
            bucket,
            direction: directions.length ? directions : undefined,
            outcome: outcomes.length ? outcomes : undefined,
            leadId,
          },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trashView, bucket, directionCsv, outcomeCsv, leadId],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['calls-list', queryParams],
    queryFn: () => api.listCalls(queryParams),
    refetchInterval: 30_000,
  });

  const { data: counts } = useQuery({
    queryKey: ['call-counts'],
    queryFn: api.callsCounts,
    refetchInterval: 30_000,
  });

  const [modal, setModal] = useState<
    | null
    | { mode: 'create'; defaultStatus: 'completed' | 'scheduled' }
    | { mode: 'edit'; call: Call }
  >(null);
  const [detailCall, setDetailCall] = useState<Call | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['calls-list'] });
    qc.invalidateQueries({ queryKey: ['call-counts'] });
    if (leadId) {
      qc.invalidateQueries({ queryKey: ['lead-calls', leadId] });
      qc.invalidateQueries({ queryKey: ['lead', leadId] });
      qc.invalidateQueries({ queryKey: ['lead-tasks', leadId] });
    }
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
  const restore = useMutation({
    mutationFn: (id: string) => api.restoreCall(id),
    onSuccess: invalidate,
  });
  const purge = useMutation({
    mutationFn: (id: string) => api.purgeCall(id),
    onSuccess: invalidate,
  });

  const items = data?.items ?? [];

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6">
      <div className="flex flex-wrap items-center justify-end gap-2 mb-4">
        <Button
          variant="secondary"
          onClick={() =>
            setModal({ mode: 'create', defaultStatus: 'scheduled' })
          }
        >
          <CalendarPlus size={14} /> Schedule a call
        </Button>
        <Button
          onClick={() =>
            setModal({ mode: 'create', defaultStatus: 'completed' })
          }
        >
          <Plus size={14} /> Log a call
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border mb-4 -mx-1 overflow-x-auto scroll-thin">
        {CALL_BUCKETS.map((b) => {
          // 'all' uses the total count; the others have a dedicated key.
          const count =
            b === 'all'
              ? counts?.total
              : counts?.[b as 'scheduled' | 'today' | 'recent'];
          const active = !trashView && b === bucket;
          return (
            <button
              key={b}
              onClick={() => updateUrl({ bucket: b, trash: null })}
              className={clsx(
                'mx-1 px-4 h-10 text-bodysm font-medium border-b-2 -mb-px inline-flex items-center gap-2 whitespace-nowrap',
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-ink-muted hover:text-ink',
              )}
            >
              {bucketLabel(b)}
              <span
                className={clsx(
                  'inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded text-[11px] font-mono font-tabular',
                  active
                    ? 'bg-primary text-white'
                    : 'bg-background text-ink-muted',
                )}
              >
                {count ?? '—'}
              </span>
            </button>
          );
        })}
        <button
          onClick={() => updateUrl({ trash: '1' })}
          className={clsx(
            'mx-1 px-4 h-10 text-bodysm font-medium border-b-2 -mb-px inline-flex items-center gap-2 whitespace-nowrap ml-auto',
            trashView
              ? 'border-error text-error'
              : 'border-transparent text-ink-muted hover:text-ink',
          )}
        >
          <Trash2 size={13} />
          Trash
          <span
            className={clsx(
              'inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded text-[11px] font-mono font-tabular',
              trashView ? 'bg-error text-white' : 'bg-background text-ink-muted',
            )}
          >
            {counts?.trash ?? '—'}
          </span>
        </button>
      </div>

      {/* Filter row */}
      <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr_2fr] gap-3 mb-5">
        <DirectionChips
          value={directions}
          onChange={(next) =>
            updateUrl({ direction: next.length ? next.join(',') : null })
          }
        />
        <OutcomeChips
          value={outcomes}
          onChange={(next) =>
            updateUrl({ outcome: next.length ? next.join(',') : null })
          }
        />
        <div>
          <div className="text-caption uppercase tracking-wider text-neutral mb-1">
            Lead
          </div>
          <LeadTypeahead
            value={leadId ?? null}
            onChange={(id) => updateUrl({ lead: id })}
            placeholder="Any lead"
          />
        </div>
      </div>

      <Card className="!p-0 overflow-hidden">
        {isLoading ? (
          <div className="px-5 py-8 text-bodysm text-ink-muted">Loading…</div>
        ) : items.length === 0 ? (
          <div className="px-5 py-12 text-center text-ink-muted text-bodysm">
            {trashView
              ? 'Trash is empty.'
              : `No ${bucketLabel(bucket).toLowerCase()} calls.`}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((c) => (
              <CallRow
                key={c.id}
                call={c}
                trashed={trashView}
                onOpen={() => setDetailCall(c)}
                onEdit={() => setModal({ mode: 'edit', call: c })}
                onComplete={() => {
                  // "Mark as done": open the form pre-stamped with the
                  // current time + completed status; outcome is then
                  // required before save.
                  setModal({
                    mode: 'edit',
                    call: {
                      ...c,
                      occurredAt: new Date().toISOString(),
                      status: 'completed',
                    },
                  });
                }}
                onCancel={() =>
                  update.mutate({ id: c.id, patch: { status: 'cancelled' } })
                }
                onDelete={() => {
                  if (confirm('Move this call to trash?')) remove.mutate(c.id);
                }}
                onRestore={() => restore.mutate(c.id)}
                onPurge={() => {
                  if (confirm('Permanently delete this call? This cannot be undone.'))
                    purge.mutate(c.id);
                }}
              />
            ))}
          </ul>
        )}
      </Card>

      <CallFormModal
        open={modal !== null}
        initial={modal?.mode === 'edit' ? modal.call : undefined}
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
          setDetailCall(null);
          setModal({
            mode: 'edit',
            call: {
              ...c,
              occurredAt: new Date().toISOString(),
              status: 'completed',
            },
          });
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
    </div>
  );
}

function CallRow({
  call,
  trashed,
  onOpen,
  onEdit,
  onComplete,
  onCancel,
  onDelete,
  onRestore,
  onPurge,
}: {
  call: Call;
  trashed?: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onPurge: () => void;
}) {
  const Icon = directionIcon(call.direction);
  const when = whenLabel(call.occurredAt, call.status);
  const dial = callDialHref(call);
  const phone =
    call.direction === 'outbound' ? call.toPhone : call.fromPhone;
  const showDial = !!dial && call.status !== 'cancelled';

  return (
    <li className="group px-5 py-3.5 hover:bg-background flex items-start gap-3">
      <div className="mt-1 shrink-0">
        <Icon
          size={16}
          className={
            call.direction === 'outbound' ? 'text-primary' : 'text-success'
          }
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onOpen}
            className="font-medium text-ink hover:text-primary text-left truncate"
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
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          {call.lead && (
            <Link
              href={`/leads/${call.lead.id}`}
              className="inline-flex items-center gap-1.5 text-caption text-primary hover:underline truncate max-w-[260px]"
            >
              {call.lead.businessName}
            </Link>
          )}
          {call.lead && <StageBadge stage={call.lead.stage} />}
          {call.contact && (
            <span className="text-caption text-neutral whitespace-nowrap">
              with {call.contact.name}
            </span>
          )}
          {phone && (
            <span className="text-caption text-neutral whitespace-nowrap font-mono">
              {phone}
            </span>
          )}
          <span className={clsx('text-caption', TONE[when.tone])}>
            {when.label}
          </span>
          {call.status === 'completed' && (
            <span className="text-caption text-neutral font-mono">
              {formatDuration(call.durationSec)}
            </span>
          )}
        </div>
        {call.notes && (
          <div className="text-caption text-ink-muted mt-1 line-clamp-1">
            {call.notes}
          </div>
        )}
      </div>
      <div className="flex items-start gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {trashed ? (
          <>
            <button
              onClick={onRestore}
              title="Restore"
              className="p-1 rounded-md text-neutral hover:text-success hover:bg-background"
            >
              <RotateCcw size={14} />
            </button>
            <button
              onClick={onPurge}
              title="Delete permanently"
              className="p-1 rounded-md text-neutral hover:text-error hover:bg-background"
            >
              <Trash2 size={13} />
            </button>
          </>
        ) : (
          <>
            {call.status === 'scheduled' && (
              <button
                onClick={onComplete}
                title="Mark completed"
                className="p-1 rounded-md text-neutral hover:text-success hover:bg-background"
              >
                <CheckCircle2 size={14} />
              </button>
            )}
            {call.status === 'scheduled' && (
              <button
                onClick={onCancel}
                title="Cancel"
                className="p-1 rounded-md text-neutral hover:text-warning hover:bg-background"
              >
                <X size={14} />
              </button>
            )}
            <button
              onClick={onEdit}
              title="Edit"
              className="p-1 rounded-md text-neutral hover:text-ink hover:bg-background"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={onDelete}
              title="Move to trash"
              className="p-1 rounded-md text-neutral hover:text-error hover:bg-background"
            >
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function DirectionChips({
  value,
  onChange,
}: {
  value: CallDirection[];
  onChange: (next: CallDirection[]) => void;
}) {
  const selected = new Set(value);
  return (
    <div>
      <div className="text-caption uppercase tracking-wider text-neutral mb-1">
        Direction
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CALL_DIRECTIONS.map((d) => {
          const on = selected.has(d);
          return (
            <button
              key={d}
              onClick={() => {
                if (on) onChange(value.filter((v) => v !== d));
                else onChange([...value, d]);
              }}
              className={clsx(
                'inline-flex items-center h-7 px-2.5 rounded-md text-[12px] font-medium border transition-colors',
                on
                  ? 'bg-primary text-white border-primary'
                  : 'bg-surface text-ink-muted border-border hover:border-primary',
              )}
            >
              {directionLabel(d)}
            </button>
          );
        })}
        {value.length > 0 && (
          <button
            onClick={() => onChange([])}
            className="text-caption text-ink-muted hover:text-error inline-flex items-center px-2 h-7"
          >
            clear
          </button>
        )}
      </div>
    </div>
  );
}

function OutcomeChips({
  value,
  onChange,
}: {
  value: CallOutcome[];
  onChange: (next: CallOutcome[]) => void;
}) {
  const selected = new Set(value);
  return (
    <div>
      <div className="text-caption uppercase tracking-wider text-neutral mb-1">
        Outcome
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CALL_OUTCOMES.map((o) => {
          const on = selected.has(o);
          return (
            <button
              key={o}
              onClick={() => {
                if (on) onChange(value.filter((v) => v !== o));
                else onChange([...value, o]);
              }}
              className={clsx(
                'inline-flex items-center h-7 px-2.5 rounded-md text-[12px] font-medium border transition-colors',
                outcomeClass(o),
                !on && 'opacity-70 hover:opacity-100',
                on && 'ring-2 ring-primary/40',
              )}
            >
              {outcomeLabel(o)}
            </button>
          );
        })}
        {value.length > 0 && (
          <button
            onClick={() => onChange([])}
            className="text-caption text-ink-muted hover:text-error inline-flex items-center px-2 h-7"
          >
            clear
          </button>
        )}
      </div>
    </div>
  );
}
