'use client';

import { useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import clsx from 'clsx';
import { api, Lead, LeadActivityEvent, LeadStage } from '@/lib/api';
import { stageClass, stageLabel } from '@/lib/stages';
import { Card } from '../ui/Card';
import { SectionHeader } from './LeadOverviewCard';
import { StagePicker } from './StagePicker';
import { relativeTime } from '@/lib/time';
import { LeadEmailHistory } from './LeadEmailHistory';
import { LeadCallsPanel } from './LeadCallsPanel';
import { LeadMeetingsPanel } from './LeadMeetingsPanel';
import { LeadTasksPanel } from './LeadTasksPanel';
import { LeadProposalsPanel } from './LeadProposalsPanel';
import { LeadSequencesPanel } from './LeadSequencesPanel';
import { LeadNotesPanel } from './LeadNotesPanel';
import {
  CheckSquare,
  FileText,
  GitBranch,
  Mail,
  Phone,
  StickyNote,
  Trash2,
  Video,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

type TabId =
  | 'stage'
  | 'emails'
  | 'calls'
  | 'meetings'
  | 'tasks'
  | 'proposals'
  | 'notes'
  | 'sequences';

const TABS: { id: TabId; label: string; Icon: LucideIcon }[] = [
  { id: 'stage', label: 'Stage', Icon: GitBranch },
  { id: 'emails', label: 'Emails', Icon: Mail },
  { id: 'calls', label: 'Calls', Icon: Phone },
  { id: 'meetings', label: 'Meetings', Icon: Video },
  { id: 'tasks', label: 'Tasks', Icon: CheckSquare },
  { id: 'proposals', label: 'Proposals', Icon: FileText },
  { id: 'notes', label: 'Notes', Icon: StickyNote },
  { id: 'sequences', label: 'Sequences', Icon: Workflow },
];

/**
 * Phase 19.2 — tabbed lead detail surface. Each tab renders the
 * corresponding CRUD panel (so create/edit/delete still work). The
 * Stage tab combines a current-stage editor with a deletable history
 * list backed by /leads/:leadId/activity (filtered) and
 * DELETE /leads/:leadId/stage-history/:entryId.
 */
export function LeadActivityPanel({
  lead,
  onOpenEmail,
}: {
  lead: Lead;
  onOpenEmail?: (emailLogId: string) => void;
}) {
  const [tab, setTab] = useState<TabId>('stage');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={clsx(
              'inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-bodysm font-medium border transition-colors',
              tab === id
                ? 'bg-primary text-white border-primary'
                : 'bg-surface text-ink-muted border-border hover:border-primary',
            )}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'stage' && <StageHistoryPanel lead={lead} />}
        {tab === 'emails' && (
          <LeadEmailHistory leadId={lead.id} onOpen={onOpenEmail} />
        )}
        {tab === 'calls' && <LeadCallsPanel lead={lead} />}
        {tab === 'meetings' && <LeadMeetingsPanel lead={lead} />}
        {tab === 'tasks' && <LeadTasksPanel lead={lead} />}
        {tab === 'proposals' && <LeadProposalsPanel lead={lead} />}
        {tab === 'notes' && <LeadNotesPanel leadId={lead.id} />}
        {tab === 'sequences' && <LeadSequencesPanel lead={lead} />}
      </div>
    </div>
  );
}

interface StagePeriod {
  stage: LeadStage;
  /** When the lead entered this stage. */
  startedAt: string;
  /** When the lead left this stage. null = still in this stage. */
  endedAt: string | null;
  /** Trigger that ENDED this period (= the next transition's reason). null while still active. */
  endedBy: string | null;
  /** id of the LeadStageHistory row that ended this period — for delete. */
  exitEntryId: string | null;
}

/**
 * Compute the contiguous list of stage periods from lead.createdAt and the
 * sorted-ascending stage_changed history. The result reads chronologically —
 * the first period starts at the lead's creation, the last period is still
 * active and ends at "now".
 */
function buildStagePeriods(
  lead: Lead,
  history: Array<
    Extract<LeadActivityEvent, { kind: 'stage_changed' }>
  >,
): StagePeriod[] {
  const sorted = [...history].sort((a, b) =>
    a.at < b.at ? -1 : a.at > b.at ? 1 : 0,
  );
  if (sorted.length === 0) {
    return [
      {
        stage: lead.stage,
        startedAt: lead.createdAt,
        endedAt: null,
        endedBy: null,
        exitEntryId: null,
      },
    ];
  }
  const periods: StagePeriod[] = [];
  // Initial period: from lead creation until the first transition out of the
  // initial stage. Initial stage = first transition's fromStage.
  periods.push({
    stage: sorted[0].fromStage,
    startedAt: lead.createdAt,
    endedAt: sorted[0].at,
    endedBy: sorted[0].trigger,
    exitEntryId: sorted[0].entryId,
  });
  // Middle periods (each transition starts a period that the next transition ends).
  for (let i = 0; i < sorted.length - 1; i++) {
    periods.push({
      stage: sorted[i].toStage,
      startedAt: sorted[i].at,
      endedAt: sorted[i + 1].at,
      endedBy: sorted[i + 1].trigger,
      exitEntryId: sorted[i + 1].entryId,
    });
  }
  // Final period: started by the last transition, currently active.
  const last = sorted[sorted.length - 1];
  periods.push({
    stage: last.toStage,
    startedAt: last.at,
    endedAt: null,
    endedBy: null,
    exitEntryId: null,
  });
  return periods;
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return '< 1m';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const m = mins % 60;
    return m > 0 ? `${hours}h ${m}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    const h = hours % 24;
    return h > 0 ? `${days}d ${h}h` : `${days}d`;
  }
  const months = Math.floor(days / 30);
  const d = days % 30;
  return d > 0 ? `${months}mo ${d}d` : `${months}mo`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function StageHistoryPanel({ lead }: { lead: Lead }) {
  const qc = useQueryClient();

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['lead-activity', lead.id],
    queryFn: () => api.getLeadActivity(lead.id, { days: 365, limit: 200 }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const stageMut = useMutation({
    mutationFn: (stage: LeadStage) => api.updateLeadStage(lead.id, stage),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead', lead.id] });
      qc.invalidateQueries({ queryKey: ['lead-activity', lead.id] });
      qc.invalidateQueries({ queryKey: ['leads-global'] });
    },
  });

  const deleteEntry = useMutation({
    mutationFn: (entryId: string) =>
      api.deleteStageHistoryEntry(lead.id, entryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-activity', lead.id] });
    },
  });

  const transitions = events.filter(
    (e): e is Extract<LeadActivityEvent, { kind: 'stage_changed' }> =>
      e.kind === 'stage_changed',
  );
  const periods = buildStagePeriods(lead, transitions);

  return (
    <Card>
      <SectionHeader icon={<GitBranch size={14} />} title="Stage timeline" />

      <div className="flex items-center gap-3 flex-wrap pb-4 mb-4 border-b border-border">
        <span className="text-caption uppercase tracking-wider text-neutral">
          Current stage
        </span>
        <StagePicker
          value={lead.stage}
          onChange={(s) => stageMut.mutate(s)}
          pending={stageMut.isPending}
        />
        <span className="text-caption text-ink-muted">
          {transitions.length} change{transitions.length === 1 ? '' : 's'} on record
        </span>
      </div>

      {isLoading ? (
        <div className="text-bodysm text-ink-muted py-6">Loading…</div>
      ) : (
        <ol className="relative pl-5 space-y-4">
          <span
            className="absolute left-1.5 top-1 bottom-1 w-px bg-border"
            aria-hidden
          />
          {periods
            .slice()
            .reverse() // newest period first
            .map((p) => {
              const start = new Date(p.startedAt).getTime();
              const end = p.endedAt
                ? new Date(p.endedAt).getTime()
                : Date.now();
              const duration = formatDuration(Math.max(0, end - start));
              const active = p.endedAt === null;
              return (
                <li
                  key={`${p.stage}-${p.startedAt}`}
                  className="relative group"
                >
                  <span
                    className={clsx(
                      'absolute left-0 mt-1.5 h-3 w-3 rounded-full border-2 border-surface -translate-x-[2.5px]',
                      active ? 'bg-success' : 'bg-primary',
                    )}
                    aria-hidden
                  />
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={clsx(
                            'inline-flex items-center h-6 px-2 rounded text-bodysm font-medium border',
                            stageClass(p.stage),
                          )}
                        >
                          {stageLabel(p.stage)}
                        </span>
                        <span className="text-bodysm font-medium text-ink">
                          · {duration}
                        </span>
                        {active && (
                          <span className="inline-flex items-center h-5 px-1.5 rounded text-[10px] font-medium bg-success/10 text-success border border-success/20">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="text-caption text-ink-muted mt-1">
                        {formatDate(p.startedAt)}{' '}
                        <span className="text-neutral">→</span>{' '}
                        {p.endedAt ? formatDate(p.endedAt) : 'now'}
                      </div>
                      {p.endedBy && (
                        <div className="text-caption text-neutral mt-0.5">
                          Ended by:{' '}
                          {p.endedBy === 'manual'
                            ? 'Manual change'
                            : `Automated · ${p.endedBy.replace(/_/g, ' ')}`}
                        </div>
                      )}
                    </div>
                    <span
                      className="text-caption text-ink-muted whitespace-nowrap shrink-0 mt-1"
                      title={new Date(p.startedAt).toLocaleString()}
                    >
                      {relativeTime(p.startedAt)}
                    </span>
                    {p.exitEntryId && (
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            confirm(
                              'Delete the transition that ended this stage period? The current stage will not change.',
                            )
                          ) {
                            deleteEntry.mutate(p.exitEntryId!);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 transition text-neutral hover:text-error mt-1"
                        aria-label="Delete transition"
                        disabled={deleteEntry.isPending}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
        </ol>
      )}
    </Card>
  );
}
