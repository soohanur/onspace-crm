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

  const stageEvents = events.filter(
    (
      e,
    ): e is Extract<
      LeadActivityEvent,
      { kind: 'stage_changed' | 'lead_created' }
    > => e.kind === 'stage_changed' || e.kind === 'lead_created',
  );

  return (
    <Card>
      <SectionHeader icon={<GitBranch size={14} />} title="Stage" />

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
          {stageEvents.length} change{stageEvents.length === 1 ? '' : 's'} on record
        </span>
      </div>

      {isLoading ? (
        <div className="text-bodysm text-ink-muted py-6">Loading…</div>
      ) : stageEvents.length === 0 ? (
        <div className="text-bodysm text-ink-muted py-6 text-center">
          No stage changes yet.
        </div>
      ) : (
        <ol className="relative pl-5 space-y-3">
          <span
            className="absolute left-1.5 top-1 bottom-1 w-px bg-border"
            aria-hidden
          />
          {stageEvents.map((e) => (
            <li
              key={e.kind === 'stage_changed' ? e.entryId : 'lead-created'}
              className="relative group"
            >
              <span
                className="absolute left-0 mt-1.5 h-3 w-3 rounded-full border-2 border-surface bg-primary -translate-x-[2.5px]"
                aria-hidden
              />
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  {e.kind === 'lead_created' ? (
                    <div className="text-bodysm text-ink">
                      <strong>Lead created</strong>{' '}
                      <span className="text-ink-muted">— {e.leadName}</span>
                    </div>
                  ) : (
                    <>
                      <div className="text-bodysm text-ink flex items-center gap-1.5 flex-wrap">
                        <span
                          className={clsx(
                            'inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium border',
                            stageClass(e.fromStage),
                          )}
                        >
                          {stageLabel(e.fromStage)}
                        </span>
                        <span className="text-neutral">→</span>
                        <span
                          className={clsx(
                            'inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium border',
                            stageClass(e.toStage),
                          )}
                        >
                          {stageLabel(e.toStage)}
                        </span>
                      </div>
                      <div className="text-caption text-ink-muted mt-0.5">
                        {e.trigger === 'manual'
                          ? 'Manual change'
                          : `Automated · ${e.trigger.replace(/_/g, ' ')}`}
                        {e.actorLabel && (
                          <span className="text-neutral"> · {e.actorLabel}</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <span
                  className="text-caption text-ink-muted whitespace-nowrap shrink-0 mt-0.5"
                  title={new Date(e.at).toLocaleString()}
                >
                  {relativeTime(e.at)}
                </span>
                {e.kind === 'stage_changed' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        confirm(
                          'Delete this stage history entry? The current stage will not change.',
                        )
                      ) {
                        deleteEntry.mutate(e.entryId);
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 transition text-neutral hover:text-error"
                    aria-label="Delete entry"
                    disabled={deleteEntry.isPending}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
