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

  // Newest-first transitions and the lead-created event, kept as separate
  // log rows so every state change in the lead's life is explicit.
  const transitions = events
    .filter(
      (e): e is Extract<LeadActivityEvent, { kind: 'stage_changed' }> =>
        e.kind === 'stage_changed',
    )
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  // For each transition, compute how long the lead was in the previous stage
  // (= time since the previous transition, or since lead.createdAt for the
  // very first transition).
  const ascending = [...transitions].reverse();
  const dwellByEntryId = new Map<string, number>();
  for (let i = 0; i < ascending.length; i++) {
    const prevAt =
      i === 0
        ? new Date(lead.createdAt).getTime()
        : new Date(ascending[i - 1].at).getTime();
    const currAt = new Date(ascending[i].at).getTime();
    dwellByEntryId.set(ascending[i].entryId, Math.max(0, currAt - prevAt));
  }

  // Time spent in the current stage = time since the last transition, or
  // since lead.createdAt if there are no transitions yet.
  const lastTransitionAt =
    transitions.length > 0
      ? new Date(transitions[0].at).getTime()
      : new Date(lead.createdAt).getTime();
  const currentDwell = formatDuration(Math.max(0, Date.now() - lastTransitionAt));

  return (
    <Card>
      <SectionHeader icon={<GitBranch size={14} />} title="Stage history" />

      <div className="flex items-center gap-3 flex-wrap pb-4 mb-4 border-b border-border">
        <span className="text-caption uppercase tracking-wider text-neutral">
          Current
        </span>
        <StagePicker
          value={lead.stage}
          onChange={(s) => stageMut.mutate(s)}
          pending={stageMut.isPending}
        />
        <span className="text-caption text-ink-muted">
          for {currentDwell}
        </span>
        <span className="text-caption text-neutral">
          · {transitions.length} change{transitions.length === 1 ? '' : 's'} on record
        </span>
      </div>

      {isLoading ? (
        <div className="text-bodysm text-ink-muted py-6">Loading…</div>
      ) : (
        <ol className="relative pl-5 space-y-3">
          <span
            className="absolute left-1.5 top-1 bottom-1 w-px bg-border"
            aria-hidden
          />

          {transitions.map((t) => {
            const dwellMs = dwellByEntryId.get(t.entryId) ?? 0;
            return (
              <li key={t.entryId} className="relative group">
                <span
                  className="absolute left-0 mt-1.5 h-3 w-3 rounded-full border-2 border-surface bg-primary -translate-x-[2.5px]"
                  aria-hidden
                />
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={clsx(
                          'inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium border',
                          stageClass(t.fromStage),
                        )}
                      >
                        {stageLabel(t.fromStage)}
                      </span>
                      <span className="text-neutral">→</span>
                      <span
                        className={clsx(
                          'inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium border',
                          stageClass(t.toStage),
                        )}
                      >
                        {stageLabel(t.toStage)}
                      </span>
                      <span className="text-caption text-ink-muted">
                        · was in {stageLabel(t.fromStage)} for{' '}
                        {formatDuration(dwellMs)}
                      </span>
                    </div>
                    <div className="text-caption text-ink-muted mt-1 font-mono font-tabular">
                      {formatDate(t.at)}
                    </div>
                    <div className="text-caption text-neutral mt-0.5">
                      {t.trigger === 'manual'
                        ? 'Manual change'
                        : `Automated · ${t.trigger.replace(/_/g, ' ')}`}
                      {t.actorLabel && (
                        <span className="text-neutral"> · {t.actorLabel}</span>
                      )}
                    </div>
                  </div>
                  <span
                    className="text-caption text-ink-muted whitespace-nowrap shrink-0 mt-1"
                    title={new Date(t.at).toLocaleString()}
                  >
                    {relativeTime(t.at)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        confirm(
                          'Delete this transition entry? The current stage will not change.',
                        )
                      ) {
                        deleteEntry.mutate(t.entryId);
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 transition text-neutral hover:text-error mt-1"
                    aria-label="Delete entry"
                    disabled={deleteEntry.isPending}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </li>
            );
          })}

          {/* Always show the created event at the very bottom — it's the
              anchor of every duration calc above. */}
          <li className="relative">
            <span
              className="absolute left-0 mt-1.5 h-3 w-3 rounded-full border-2 border-surface bg-neutral -translate-x-[2.5px]"
              aria-hidden
            />
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-bodysm text-ink">
                  <strong>Lead created</strong>
                </div>
                <div className="text-caption text-ink-muted mt-1 font-mono font-tabular">
                  {formatDate(lead.createdAt)}
                </div>
              </div>
              <span
                className="text-caption text-ink-muted whitespace-nowrap shrink-0 mt-1"
                title={new Date(lead.createdAt).toLocaleString()}
              >
                {relativeTime(lead.createdAt)}
              </span>
            </div>
          </li>
        </ol>
      )}
    </Card>
  );
}
