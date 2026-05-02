'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import clsx from 'clsx';
import {
  api,
  EnrollmentStatus,
  Lead,
  SequenceEnrollment,
  SequenceSummary,
} from '@/lib/api';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { SectionHeader } from './LeadOverviewCard';
import { relativeTime } from '@/lib/time';
import {
  Mail,
  Plus,
  UserMinus,
  X,
} from 'lucide-react';

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

/**
 * Phase 18 — lead-detail sequences panel. Shows active enrollments + a
 * compact history of completed/exited ones, with a manual "Enroll in
 * sequence" picker that lists ACTIVE sequences only (drafts/paused
 * shouldn't accept ad-hoc adds — drafts haven't been validated, paused
 * are deliberately frozen).
 */
export function LeadSequencesPanel({ lead }: { lead: Lead }) {
  const qc = useQueryClient();
  const { data: enrollments = [] } = useQuery<SequenceEnrollment[]>({
    queryKey: ['lead-sequences', lead.id],
    queryFn: () => api.listLeadSequences(lead.id),
  });

  const [enrollOpen, setEnrollOpen] = useState(false);

  const unenroll = useMutation({
    mutationFn: ({
      sequenceId,
      enrollmentId,
    }: {
      sequenceId: string;
      enrollmentId: string;
    }) => api.unenrollFromSequence(sequenceId, enrollmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-sequences', lead.id] });
    },
  });

  const active = enrollments.filter((e) => e.status === 'active');
  const history = enrollments.filter((e) => e.status !== 'active');

  return (
    <Card>
      <SectionHeader
        icon={<Mail size={14} />}
        title={`Sequences (${active.length} active · ${enrollments.length} total)`}
        right={
          <button
            onClick={() => setEnrollOpen(true)}
            className="text-caption text-primary hover:underline inline-flex items-center gap-1"
          >
            <Plus size={12} /> Enroll in sequence
          </button>
        }
      />

      {enrollments.length === 0 ? (
        <div className="text-bodysm text-ink-muted py-3">
          Not enrolled in any sequence.
        </div>
      ) : (
        <ul className="divide-y divide-border -mx-1">
          {active.map((e) => (
            <EnrollmentRow
              key={e.id}
              enrollment={e}
              onUnenroll={() =>
                unenroll.mutate({
                  sequenceId: e.sequenceId,
                  enrollmentId: e.id,
                })
              }
            />
          ))}
          {history.map((e) => (
            <EnrollmentRow key={e.id} enrollment={e} onUnenroll={() => {}} />
          ))}
        </ul>
      )}

      {enrollOpen && (
        <EnrollPicker
          leadId={lead.id}
          enrolledSequenceIds={new Set(enrollments.map((e) => e.sequenceId))}
          onClose={() => setEnrollOpen(false)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ['lead-sequences', lead.id] });
            setEnrollOpen(false);
          }}
        />
      )}
    </Card>
  );
}

function EnrollmentRow({
  enrollment,
  onUnenroll,
}: {
  enrollment: SequenceEnrollment;
  onUnenroll: () => void;
}) {
  const totalSteps = enrollment.sequence?._count?.steps ?? 0;
  const lastSend = enrollment.sends?.[enrollment.sends.length - 1];
  return (
    <li className="px-1 py-2.5 group flex items-start gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {enrollment.sequence ? (
            <Link
              href={`/campaigns/sequences/${enrollment.sequenceId}`}
              className="text-bodysm font-medium text-ink hover:text-primary truncate"
            >
              {enrollment.sequence.name}
            </Link>
          ) : (
            <span className="text-bodysm font-medium text-ink truncate">
              Sequence
            </span>
          )}
          <span
            className={clsx(
              'inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium border whitespace-nowrap',
              ENROLLMENT_STATUS_CLASS[enrollment.status],
            )}
          >
            {ENROLLMENT_STATUS_LABEL[enrollment.status]}
          </span>
        </div>
        <div className="mt-0.5 text-caption text-ink-muted flex items-center gap-2 flex-wrap">
          {enrollment.status === 'active' ? (
            <>
              <span>
                Step {enrollment.nextStepOrder} / {totalSteps}
              </span>
              <span>·</span>
              <span>
                Next send{' '}
                {new Date(enrollment.nextSendAt).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            </>
          ) : (
            <>
              <span>
                {totalSteps} step{totalSteps === 1 ? '' : 's'}
              </span>
              {enrollment.exitReason && (
                <>
                  <span>·</span>
                  <span title={enrollment.exitReason} className="truncate max-w-[280px]">
                    {enrollment.exitReason}
                  </span>
                </>
              )}
            </>
          )}
          {lastSend?.sentAt && (
            <>
              <span>·</span>
              <span>last sent {relativeTime(lastSend.sentAt)}</span>
            </>
          )}
        </div>
      </div>
      {enrollment.status === 'active' && (
        <button
          onClick={() => {
            if (confirm('Unenroll from this sequence?')) onUnenroll();
          }}
          className="opacity-0 group-hover:opacity-100 text-caption text-ink-muted hover:text-error inline-flex items-center gap-1 transition-opacity shrink-0"
          title="Unenroll"
        >
          <UserMinus size={11} />
          Unenroll
        </button>
      )}
    </li>
  );
}

function EnrollPicker({
  leadId,
  enrolledSequenceIds,
  onClose,
  onDone,
}: {
  leadId: string;
  enrolledSequenceIds: Set<string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const { data: sequences = [] } = useQuery<SequenceSummary[]>({
    queryKey: ['sequences-active'],
    queryFn: () => api.listSequences({ status: ['active'] }),
  });

  const enroll = useMutation({
    mutationFn: (sequenceId: string) =>
      api.enrollLeads(sequenceId, [leadId]),
    onSuccess: onDone,
  });

  const eligible = sequences.filter((s) => !enrolledSequenceIds.has(s.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-lg shadow-e3 w-full max-w-md">
        <header className="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <h2 className="text-h3">Enroll in sequence</h2>
          <button
            onClick={onClose}
            className="text-neutral hover:text-error"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>
        <div className="p-5">
          {eligible.length === 0 ? (
            <div className="text-bodysm text-ink-muted py-3">
              {sequences.length === 0
                ? 'No active sequences. Start one from the Campaigns page.'
                : 'This lead is already enrolled in every active sequence.'}
            </div>
          ) : (
            <ul className="space-y-1">
              {eligible.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => {
                      if (confirm(`Enroll this lead in "${s.name}"?`)) {
                        enroll.mutate(s.id);
                      }
                    }}
                    disabled={enroll.isPending}
                    className="w-full flex items-center justify-between gap-2 px-3 h-10 rounded-md border border-border bg-surface hover:border-primary hover:bg-background text-left disabled:opacity-50"
                  >
                    <span className="text-bodysm font-medium text-ink truncate">
                      {s.name}
                    </span>
                    <span className="text-caption text-ink-muted shrink-0">
                      {s._count?.steps ?? s.steps?.length ?? 0} step
                      {(s._count?.steps ?? s.steps?.length ?? 0) === 1 ? '' : 's'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {enroll.error && (
            <div className="text-caption text-error mt-3">
              {(enroll.error as Error).message}
            </div>
          )}
          <div className="flex justify-end mt-3">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
