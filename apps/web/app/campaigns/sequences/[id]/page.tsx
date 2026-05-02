'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Suspense, use, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import clsx from 'clsx';
import {
  api,
  EnrollmentStatus,
  SequenceEnrollment,
  SequenceStatus,
  SequenceSummary,
} from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LeadTypeahead } from '@/components/tasks/LeadTypeahead';
import { StageBadge } from '@/components/leads/StageBadge';
import { relativeTime } from '@/lib/time';
import {
  AlertCircle,
  ArrowLeft,
  Archive,
  CheckCircle2,
  Clock,
  Pause,
  Play,
  Plus,
  Trash2,
  UserMinus,
  X,
} from 'lucide-react';

const SEQUENCE_STATUS_LABEL: Record<SequenceStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  archived: 'Archived',
};
const SEQUENCE_STATUS_CLASS: Record<SequenceStatus, string> = {
  draft: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  active: 'bg-green-100 text-green-700 border-green-200',
  paused: 'bg-amber-100 text-amber-700 border-amber-200',
  archived: 'bg-zinc-200 text-zinc-700 border-zinc-300',
};

const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  active: 'Active',
  completed: 'Completed',
  exited_replied: 'Replied',
  exited_stage: 'Progressed',
  exited_manual: 'Removed',
};
const ENROLLMENT_STATUS_CLASS: Record<EnrollmentStatus, string> = {
  active: 'bg-blue-100 text-blue-700 border-blue-200',
  completed: 'bg-green-100 text-green-700 border-green-200',
  exited_replied: 'bg-success/10 text-success border-success/20',
  exited_stage: 'bg-amber-100 text-amber-700 border-amber-200',
  exited_manual: 'bg-zinc-100 text-zinc-700 border-zinc-200',
};

export default function SequenceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense
      fallback={
        <div className="max-w-[1100px] mx-auto px-6 py-8 text-ink-muted">
          Loading…
        </div>
      }
    >
      <Body id={id} />
    </Suspense>
  );
}

function Body({ id }: { id: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [enrollOpen, setEnrollOpen] = useState(false);

  const { data: seq, isLoading } = useQuery({
    queryKey: ['sequence', id],
    queryFn: () => api.getSequence(id),
    refetchInterval: 10_000,
  });

  const { data: enrollmentsPage } = useQuery({
    queryKey: ['sequence-enrollments', id],
    queryFn: () => api.listSequenceEnrollments(id, { take: 100 }),
    refetchInterval: 10_000,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: api.listTemplates,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['sequence', id] });
    qc.invalidateQueries({ queryKey: ['sequence-enrollments', id] });
    qc.invalidateQueries({ queryKey: ['sequences'] });
  };

  const start = useMutation({
    mutationFn: () => api.startSequence(id),
    onSuccess: invalidate,
  });
  const pause = useMutation({
    mutationFn: () => api.pauseSequence(id),
    onSuccess: invalidate,
  });
  const resume = useMutation({
    mutationFn: () => api.resumeSequence(id),
    onSuccess: invalidate,
  });
  const archive = useMutation({
    mutationFn: () => api.archiveSequence(id),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: () => api.deleteSequence(id),
    onSuccess: () => router.push('/campaigns?tab=sequences'),
  });
  const unenroll = useMutation({
    mutationFn: (enrollmentId: string) =>
      api.unenrollFromSequence(id, enrollmentId),
    onSuccess: invalidate,
  });

  if (isLoading || !seq) {
    return (
      <div className="max-w-[1100px] mx-auto px-6 py-8 text-ink-muted">
        Loading…
      </div>
    );
  }

  const enrollments = enrollmentsPage?.items ?? [];
  const isReadOnly = seq.status === 'archived';

  // Counts derived from enrollments page (covers most cases — for very
  // large sequences the seq.* counters carry truth).
  const activeCount = enrollments.filter((e) => e.status === 'active').length;
  const completedCount = seq.completedCount;
  const exitedCount = seq.exitedCount;

  const exitReasonCounts = enrollments.reduce<Record<string, number>>((acc, e) => {
    if (e.status.startsWith('exited_')) {
      acc[e.status] = (acc[e.status] ?? 0) + 1;
    }
    return acc;
  }, {});

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8 space-y-5">
      <header>
        <Link
          href="/campaigns?tab=sequences"
          className="text-caption text-ink-muted hover:text-primary inline-flex items-center gap-1 mb-3"
        >
          <ArrowLeft size={12} /> All sequences
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-h2 truncate">{seq.name}</h1>
              <span
                className={clsx(
                  'inline-flex items-center h-6 px-2 rounded-md text-[12px] font-medium border',
                  SEQUENCE_STATUS_CLASS[seq.status],
                )}
              >
                {SEQUENCE_STATUS_LABEL[seq.status]}
              </span>
            </div>
            {seq.description && (
              <p className="text-bodysm text-ink-muted mt-1">
                {seq.description}
              </p>
            )}
            <div className="text-caption text-ink-muted mt-1 flex flex-wrap gap-3">
              <span>From {seq.account?.email ?? '—'}</span>
              {seq.group && <span>Group: {seq.group.name}</span>}
              {seq.startedAt && (
                <span>
                  Started {new Date(seq.startedAt).toLocaleDateString()}
                </span>
              )}
              <span>
                {seq.dailySendLimit}/day · {seq.sendIntervalSec}s interval
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {seq.status === 'draft' && (
              <Button
                onClick={() => start.mutate()}
                disabled={start.isPending}
              >
                <Play size={13} /> Start
              </Button>
            )}
            {seq.status === 'paused' && (
              <Button
                onClick={() => resume.mutate()}
                disabled={resume.isPending}
              >
                <Play size={13} /> Resume
              </Button>
            )}
            {seq.status === 'active' && (
              <Button
                variant="secondary"
                onClick={() => pause.mutate()}
                disabled={pause.isPending}
              >
                <Pause size={13} /> Pause
              </Button>
            )}
            {seq.status !== 'archived' && (
              <Button
                variant="secondary"
                onClick={() => {
                  if (
                    confirm(
                      'Archive this sequence? Active enrollments will exit and the sequence becomes read-only.',
                    )
                  ) {
                    archive.mutate();
                  }
                }}
                disabled={archive.isPending}
              >
                <Archive size={13} /> Archive
              </Button>
            )}
            {(seq.status === 'draft' || seq.status === 'archived') && (
              <button
                onClick={() => {
                  if (confirm('Delete this sequence permanently?')) {
                    remove.mutate();
                  }
                }}
                disabled={remove.isPending}
                className="inline-flex items-center gap-1 h-9 px-3 rounded-md border border-border text-bodysm text-error hover:bg-error/5 hover:border-error/40"
              >
                <Trash2 size={13} /> Delete
              </button>
            )}
          </div>
        </div>
        {(start.error || pause.error || resume.error || archive.error || remove.error) && (
          <div className="text-caption text-error mt-2">
            {((start.error ??
              pause.error ??
              resume.error ??
              archive.error ??
              remove.error) as Error).message}
          </div>
        )}
      </header>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Enrolled" value={seq.enrolledCount} />
        <Stat label="Active (page)" value={activeCount} />
        <Stat label="Completed" value={completedCount} tone="text-success" />
        <Stat label="Exited" value={exitedCount} tone="text-warning" />
      </div>
      {Object.keys(exitReasonCounts).length > 0 && (
        <div className="text-caption text-ink-muted">
          Exit breakdown:{' '}
          {Object.entries(exitReasonCounts).map(([k, v], idx) => (
            <span key={k}>
              {idx > 0 && ' · '}
              {ENROLLMENT_STATUS_LABEL[k as EnrollmentStatus]} {v}
            </span>
          ))}
        </div>
      )}

      {/* Steps */}
      <Card className="!p-4">
        <div className="text-caption uppercase tracking-wider text-neutral mb-3">
          Steps ({seq.steps?.length ?? 0})
        </div>
        {!seq.steps || seq.steps.length === 0 ? (
          <div className="text-bodysm text-ink-muted">No steps configured.</div>
        ) : (
          <ol className="space-y-2">
            {seq.steps.map((s) => {
              const t = templates.find((x) => x.id === s.templateId);
              return (
                <li
                  key={s.id}
                  className="rounded-md border border-border bg-surface px-3 py-2"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-caption font-mono font-tabular text-neutral">
                      Step {s.order}
                    </span>
                    <span className="text-bodysm text-ink font-medium">
                      {t?.name ?? '(unknown template)'}
                    </span>
                    <span className="text-caption text-ink-muted ml-auto">
                      {s.order === 0 ? 'Immediate' : `+${s.delayDays} day${s.delayDays === 1 ? '' : 's'}`}
                    </span>
                  </div>
                  <div className="text-caption text-ink-muted mt-1 flex gap-3 flex-wrap">
                    <span
                      className={clsx(
                        'inline-flex items-center gap-1',
                        s.stopOnReply ? 'text-success' : 'text-neutral',
                      )}
                    >
                      <CheckCircle2 size={11} />
                      {s.stopOnReply ? 'Stop on reply' : 'Reply ignored'}
                    </span>
                    <span
                      className={clsx(
                        'inline-flex items-center gap-1',
                        s.stopOnStageProgression ? 'text-success' : 'text-neutral',
                      )}
                    >
                      <CheckCircle2 size={11} />
                      {s.stopOnStageProgression
                        ? 'Stop on stage progression'
                        : 'Stage ignored'}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {/* Enrollments */}
      <Card className="!p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2 flex-wrap">
          <div className="text-caption uppercase tracking-wider text-neutral">
            Enrollments ({enrollments.length})
          </div>
          {!isReadOnly && (
            <Button
              variant="secondary"
              onClick={() => setEnrollOpen(true)}
            >
              <Plus size={13} /> Manually enroll leads
            </Button>
          )}
        </div>
        {enrollments.length === 0 ? (
          <div className="px-5 py-12 text-center text-ink-muted text-bodysm">
            No leads enrolled yet.{' '}
            {!isReadOnly &&
              "Add a group to the sequence config or use 'Manually enroll leads' above."}
          </div>
        ) : (
          <table className="w-full text-bodysm">
            <thead className="bg-background">
              <tr className="text-caption uppercase tracking-[0.06em] text-neutral text-left">
                <th className="px-4 py-2.5">Lead</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Progress</th>
                <th className="px-4 py-2.5">Last sent</th>
                <th className="px-4 py-2.5">Next send</th>
                <th className="px-4 py-2.5">Exit reason</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map((e) => (
                <EnrollmentRow
                  key={e.id}
                  enrollment={e}
                  totalSteps={seq.steps?.length ?? 0}
                  onUnenroll={() => unenroll.mutate(e.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {enrollOpen && (
        <EnrollModal
          sequenceId={id}
          onClose={() => setEnrollOpen(false)}
          onDone={invalidate}
        />
      )}
    </div>
  );
}

function EnrollmentRow({
  enrollment,
  totalSteps,
  onUnenroll,
}: {
  enrollment: SequenceEnrollment;
  totalSteps: number;
  onUnenroll: () => void;
}) {
  const lastSend = enrollment.sends?.[0];
  const lastSentAt = lastSend?.emailLog?.sentAt ?? lastSend?.sentAt ?? null;
  return (
    <tr className="border-t border-border hover:bg-background/50">
      <td className="px-4 py-2.5">
        {enrollment.lead && (
          <Link
            href={`/leads/${enrollment.lead.id}`}
            className="inline-flex items-center gap-1.5 text-primary hover:underline truncate max-w-[260px]"
          >
            {enrollment.lead.businessName}
          </Link>
        )}
        {enrollment.lead && (
          <span className="ml-2">
            <StageBadge stage={enrollment.lead.stage} />
          </span>
        )}
        {enrollment.contact?.name && (
          <div className="text-caption text-ink-muted mt-0.5">
            with {enrollment.contact.name}
          </div>
        )}
      </td>
      <td className="px-4 py-2.5">
        <span
          className={clsx(
            'inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium border whitespace-nowrap',
            ENROLLMENT_STATUS_CLASS[enrollment.status],
          )}
        >
          {ENROLLMENT_STATUS_LABEL[enrollment.status]}
        </span>
      </td>
      <td className="px-4 py-2.5 font-mono font-tabular">
        {enrollment.status === 'active'
          ? `${enrollment.nextStepOrder} / ${totalSteps}`
          : enrollment.status === 'completed'
          ? `${totalSteps} / ${totalSteps}`
          : '—'}
      </td>
      <td className="px-4 py-2.5 text-caption text-ink-muted">
        {lastSentAt ? relativeTime(lastSentAt) : '—'}
      </td>
      <td className="px-4 py-2.5 text-caption">
        {enrollment.status === 'active' ? (
          <span className="inline-flex items-center gap-1">
            <Clock size={11} className="text-neutral" />
            {new Date(enrollment.nextSendAt).toLocaleString()}
          </span>
        ) : (
          <span className="text-ink-muted">—</span>
        )}
      </td>
      <td
        className="px-4 py-2.5 text-caption text-ink-muted truncate max-w-[220px]"
        title={enrollment.exitReason ?? ''}
      >
        {enrollment.exitReason ?? '—'}
      </td>
      <td className="px-4 py-2.5">
        {enrollment.status === 'active' && (
          <button
            onClick={() => {
              if (confirm('Unenroll this lead?')) onUnenroll();
            }}
            className="inline-flex items-center gap-1 text-caption text-ink-muted hover:text-error"
          >
            <UserMinus size={11} /> Unenroll
          </button>
        )}
      </td>
    </tr>
  );
}

function EnrollModal({
  sequenceId,
  onClose,
  onDone,
}: {
  sequenceId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const enroll = useMutation({
    mutationFn: () => api.enrollLeads(sequenceId, pickedIds),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  const result = enroll.data;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-lg shadow-e3 w-full max-w-lg">
        <header className="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <h2 className="text-h3">Enroll leads</h2>
          <button
            onClick={onClose}
            className="text-neutral hover:text-error"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>
        <div className="p-5 space-y-3">
          <div>
            <div className="text-caption uppercase tracking-wider text-neutral mb-1">
              Leads
            </div>
            <LeadTypeahead
              value={null}
              onChange={(id) => {
                if (!id) return;
                setPickedIds((prev) =>
                  prev.includes(id) ? prev : [...prev, id],
                );
              }}
              placeholder="Search leads…"
            />
            {pickedIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {pickedIds.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-primary/10 text-primary text-[12px] font-medium"
                  >
                    {id.slice(0, 8)}…
                    <button
                      type="button"
                      onClick={() =>
                        setPickedIds((prev) => prev.filter((x) => x !== id))
                      }
                      className="opacity-70 hover:opacity-100"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          {result && (
            <div className="text-caption text-ink">
              Enrolled {result.enrolled} · skipped (already enrolled){' '}
              {result.skippedAlreadyEnrolled} · skipped (no email){' '}
              {result.skippedNoEmail}
            </div>
          )}
          {enroll.error && (
            <div className="text-caption text-error">
              {(enroll.error as Error).message}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => enroll.mutate()}
              disabled={pickedIds.length === 0 || enroll.isPending}
            >
              <UserMinus size={13} /> Enroll {pickedIds.length || ''} leads
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <Card className="!p-3">
      <div className="text-caption text-neutral">{label}</div>
      <div
        className={clsx('text-h2 font-mono font-tabular mt-1', tone ?? 'text-ink')}
      >
        {value.toLocaleString()}
      </div>
    </Card>
  );
}
