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
  CreateMeetingInput,
  Meeting,
  MeetingBucket,
  MeetingStatus,
  MeetingType,
  UpdateMeetingInput,
} from '@/lib/api';
import {
  MEETING_BUCKETS,
  MEETING_STATUSES,
  MEETING_TYPES,
  bucketLabel,
  meetingJoinHref,
  meetingStatusClass,
  meetingStatusLabel,
  meetingTypeIcon,
  meetingTypeLabel,
  syncBadge,
  whenLabel,
} from '@/lib/meetings';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StageBadge } from '@/components/leads/StageBadge';
import { LeadTypeahead } from '@/components/tasks/LeadTypeahead';
import { MeetingFormModal } from '@/components/meetings/MeetingFormModal';
import { MeetingDetailsModal } from '@/components/meetings/MeetingDetailsModal';
import {
  AlertTriangle,
  CheckCircle2,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Trash2,
  Video,
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

export default function MeetingsPage() {
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

  const bucket: MeetingBucket =
    (sp.get('bucket') as MeetingBucket) &&
    MEETING_BUCKETS.includes(sp.get('bucket') as MeetingBucket)
      ? (sp.get('bucket') as MeetingBucket)
      : 'upcoming';
  const typeCsv = sp.get('type') ?? '';
  const types = typeCsv
    .split(',')
    .filter((t): t is MeetingType => MEETING_TYPES.includes(t as MeetingType));
  const statusCsv = sp.get('status') ?? '';
  const statuses = statusCsv
    .split(',')
    .filter((s): s is MeetingStatus =>
      MEETING_STATUSES.includes(s as MeetingStatus),
    );
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
    () => ({
      bucket,
      type: types.length ? types.join(',') : undefined,
      status: statuses.length ? statuses.join(',') : undefined,
      leadId,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bucket, typeCsv, statusCsv, leadId],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['meetings-list', queryParams],
    queryFn: () => api.listMeetings(queryParams as any),
    refetchInterval: 30_000,
  });

  const { data: counts } = useQuery({
    queryKey: ['meetings-counts'],
    queryFn: api.meetingsCounts,
    refetchInterval: 30_000,
  });

  const [modal, setModal] = useState<
    null | { mode: 'create' } | { mode: 'edit'; meeting: Meeting }
  >(null);
  const [detailsMeeting, setDetailsMeeting] = useState<Meeting | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['meetings-list'] });
    qc.invalidateQueries({ queryKey: ['meetings-counts'] });
    if (leadId) {
      qc.invalidateQueries({ queryKey: ['lead-meetings', leadId] });
      qc.invalidateQueries({ queryKey: ['lead', leadId] });
      qc.invalidateQueries({ queryKey: ['lead-tasks', leadId] });
    }
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
  const syncNow = useMutation({
    mutationFn: (id: string) => api.syncMeetingNow(id),
    onSuccess: invalidate,
  });

  // No-scope-anywhere banner: if at least one Gmail account is connected
  // and none of them have the calendar scope, show the warning at top.
  const { data: accounts = [] } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: api.listEmailAccounts,
  });
  const showCalendarScopeBanner =
    accounts.length > 0 && !accounts.some((a) => a.hasCalendarScope);

  const items = data?.items ?? [];

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-h1 mb-1">Meetings</h1>
          <p className="text-ink-muted text-bodysm">
            Phone, video, or in-person calls with your leads. Scheduling a
            meeting moves the lead to <strong>booked</strong>; marking one
            completed creates an automatic follow-up task. When the
            connected account has the Calendar scope, attendees also
            receive a Google Calendar invite.
          </p>
        </div>
        <Button onClick={() => setModal({ mode: 'create' })}>
          <Plus size={14} /> New meeting
        </Button>
      </div>

      {showCalendarScopeBanner && (
        <div className="mb-4 rounded-md border border-warning/40 bg-[#FEF4E5] p-3 text-bodysm flex items-start gap-2">
          <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="font-medium text-ink">Calendar sync is disabled</div>
            <div className="text-caption text-ink-muted mt-0.5">
              Your connected Gmail account is missing the Calendar Events
              scope. Meetings still save locally, but invites won't go
              out.{' '}
              <Link href="/settings" className="text-primary hover:underline">
                Disconnect &amp; reconnect from Settings
              </Link>{' '}
              to enable invites and event creation.
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border mb-4 -mx-1 overflow-x-auto scroll-thin">
        {MEETING_BUCKETS.map((b) => {
          const count = counts?.[b];
          const active = b === bucket;
          return (
            <button
              key={b}
              onClick={() => updateUrl({ bucket: b })}
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
      </div>

      {/* Filter row */}
      <div className="grid grid-cols-1 md:grid-cols-[2fr_2fr_2fr] gap-3 mb-5">
        <TypeChips
          value={types}
          onChange={(next) => updateUrl({ type: next.length ? next.join(',') : null })}
        />
        <StatusChips
          value={statuses}
          onChange={(next) =>
            updateUrl({ status: next.length ? next.join(',') : null })
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
            No {bucketLabel(bucket).toLowerCase()} meetings.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((m) => (
              <MeetingRow
                key={m.id}
                meeting={m}
                onOpen={() => setDetailsMeeting(m)}
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
                onRetrySync={() => syncNow.mutate(m.id)}
              />
            ))}
          </ul>
        )}
      </Card>

      <MeetingFormModal
        open={modal !== null}
        initial={modal?.mode === 'edit' ? modal.meeting : undefined}
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

      <MeetingDetailsModal
        meeting={detailsMeeting}
        onClose={() => setDetailsMeeting(null)}
        onEdit={(m) => {
          setDetailsMeeting(null);
          setModal({ mode: 'edit', meeting: m });
        }}
      />
    </div>
  );
}

function MeetingRow({
  meeting,
  onOpen,
  onEdit,
  onComplete,
  onCancel,
  onDelete,
  onRetrySync,
}: {
  meeting: Meeting;
  onOpen: () => void;
  onEdit: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onRetrySync: () => void;
}) {
  const TypeIcon = meetingTypeIcon(meeting.type);
  const when = whenLabel(meeting.scheduledAt, meeting.status);
  const canComplete = meeting.status === 'scheduled';
  const canCancel = meeting.status === 'scheduled';
  const sync = syncBadge(meeting);
  const SyncIcon = sync.icon;
  const join = meetingJoinHref(meeting);
  const showJoin = !!join && meeting.status === 'scheduled';

  return (
    <li className="group px-5 py-3.5 hover:bg-background flex items-start gap-3">
      <div className="mt-1 shrink-0">
        <TypeIcon size={16} className="text-ink-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onOpen}
            className="font-medium text-ink hover:text-primary text-left truncate"
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
          <span className="text-caption text-neutral whitespace-nowrap">
            {meetingTypeLabel(meeting.type)} · {meeting.durationMin}m
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          {meeting.lead && (
            <Link
              href={`/leads/${meeting.lead.id}`}
              className="inline-flex items-center gap-1.5 text-caption text-primary hover:underline truncate max-w-[260px]"
            >
              {meeting.lead.businessName}
            </Link>
          )}
          {meeting.lead && <StageBadge stage={meeting.lead.stage} />}
          {meeting.contact && (
            <span className="text-caption text-neutral whitespace-nowrap">
              with {meeting.contact.name}
            </span>
          )}
          <span className={clsx('text-caption', TONE_CLASSES[when.tone])}>
            {when.label}
          </span>
        </div>
        {meeting.notes && (
          <div className="text-caption text-ink-muted mt-1 line-clamp-2">
            {meeting.notes}
          </div>
        )}
      </div>
      <div className="flex items-start gap-2 shrink-0">
        {showJoin && (
          <a
            href={join!}
            target={join!.startsWith('tel:') ? undefined : '_blank'}
            rel="noreferrer"
            title={`Join ${meetingTypeLabel(meeting.type)}`}
            className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-primary text-white text-[11px] font-medium hover:bg-primary/90"
          >
            {meeting.type === 'phone' ? (
              <Phone size={11} />
            ) : (
              <Video size={11} />
            )}
            Join
          </a>
        )}
        {sync.state === 'synced' && meeting.externalLink ? (
          <a
            href={meeting.externalLink}
            target="_blank"
            rel="noreferrer"
            title={sync.tooltip}
            className={clsx(
              'inline-flex items-center gap-1 h-6 px-2 rounded-md border text-[11px] font-medium',
              sync.className,
            )}
          >
            <SyncIcon size={11} /> Calendar
          </a>
        ) : sync.state === 'failed' ? (
          <button
            onClick={onRetrySync}
            title={`${sync.tooltip}\nClick to retry sync`}
            className={clsx(
              'inline-flex items-center gap-1 h-6 px-2 rounded-md border text-[11px] font-medium hover:opacity-80',
              sync.className,
            )}
          >
            <SyncIcon size={11} /> {sync.label}
          </button>
        ) : null}

        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          {canComplete && (
            <button
              onClick={onComplete}
              title="Mark completed"
              className="p-1 rounded-md text-neutral hover:text-success hover:bg-background"
            >
              <CheckCircle2 size={14} />
            </button>
          )}
          {canCancel && (
            <button
              onClick={onCancel}
              title="Cancel"
              className="p-1 rounded-md text-neutral hover:text-warning hover:bg-background"
            >
              <X size={14} />
            </button>
          )}
          {sync.state === 'failed' && (
            <button
              onClick={onRetrySync}
              title="Retry sync"
              className="p-1 rounded-md text-neutral hover:text-primary hover:bg-background"
            >
              <RefreshCw size={13} />
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
            title="Delete"
            className="p-1 rounded-md text-neutral hover:text-error hover:bg-background"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </li>
  );
}

function TypeChips({
  value,
  onChange,
}: {
  value: MeetingType[];
  onChange: (next: MeetingType[]) => void;
}) {
  const selected = new Set(value);
  return (
    <div>
      <div className="text-caption uppercase tracking-wider text-neutral mb-1">
        Type
      </div>
      <div className="flex flex-wrap gap-1.5">
        {MEETING_TYPES.map((t) => {
          const on = selected.has(t);
          return (
            <button
              key={t}
              onClick={() => {
                if (on) onChange(value.filter((v) => v !== t));
                else onChange([...value, t]);
              }}
              className={clsx(
                'inline-flex items-center h-7 px-2.5 rounded-md text-[12px] font-medium border transition-colors',
                on
                  ? 'bg-primary text-white border-primary'
                  : 'bg-surface text-ink-muted border-border hover:border-primary',
              )}
            >
              {meetingTypeLabel(t)}
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

function StatusChips({
  value,
  onChange,
}: {
  value: MeetingStatus[];
  onChange: (next: MeetingStatus[]) => void;
}) {
  const selected = new Set(value);
  return (
    <div>
      <div className="text-caption uppercase tracking-wider text-neutral mb-1">
        Status
      </div>
      <div className="flex flex-wrap gap-1.5">
        {MEETING_STATUSES.map((s) => {
          const on = selected.has(s);
          return (
            <button
              key={s}
              onClick={() => {
                if (on) onChange(value.filter((v) => v !== s));
                else onChange([...value, s]);
              }}
              className={clsx(
                'inline-flex items-center h-7 px-2.5 rounded-md text-[12px] font-medium border transition-colors',
                meetingStatusClass(s),
                !on && 'opacity-70 hover:opacity-100',
                on && 'ring-2 ring-primary/40',
              )}
            >
              {meetingStatusLabel(s)}
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
