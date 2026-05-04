'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { api, LeadActivityEvent } from '@/lib/api';
import { stageClass, stageLabel } from '@/lib/stages';
import { Card } from '../ui/Card';
import { SectionHeader } from './LeadOverviewCard';
import { relativeTime } from '@/lib/time';
import {
  Activity,
  CalendarCheck,
  CalendarPlus,
  CalendarX,
  CheckCircle2,
  CheckSquare,
  FileText,
  GitBranch,
  LogOut,
  MailOpen,
  Megaphone,
  PhoneIncoming,
  PhoneOutgoing,
  Reply,
  Send,
  StickyNote,
  UserPlus,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

type Kind = LeadActivityEvent['kind'];

interface FilterChip {
  label: string;
  kinds: Kind[];
}

const FILTERS: FilterChip[] = [
  { label: 'All', kinds: [] },
  {
    label: 'Stage',
    kinds: ['stage_changed', 'lead_created'],
  },
  {
    label: 'Emails',
    kinds: ['email_sent', 'email_opened', 'email_replied'],
  },
  { label: 'Calls', kinds: ['call_logged'] },
  {
    label: 'Meetings',
    kinds: ['meeting_scheduled', 'meeting_completed', 'meeting_cancelled'],
  },
  { label: 'Tasks', kinds: ['task_created', 'task_completed'] },
  { label: 'Proposals', kinds: ['proposal_sent'] },
  { label: 'Notes', kinds: ['note_added'] },
  {
    label: 'Sequences',
    kinds: ['sequence_enrolled', 'sequence_exited', 'campaign_added'],
  },
];

/**
 * Phase 19 — full lead-scoped activity timeline. Pulls from
 * `/api/leads/:leadId/activity` and renders events chronologically with
 * filter chips at the top. Click-throughs route to the relevant
 * entity. Refetches every 30s on focus; the panel is read-only — the
 * CRUD panels above own mutations.
 */
export function LeadActivityPanel({
  leadId,
  onOpenEmail,
}: {
  leadId: string;
  onOpenEmail?: (emailLogId: string) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<string>('All');

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['lead-activity', leadId],
    queryFn: () => api.getLeadActivity(leadId, { days: 90, limit: 200 }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const filtered = useMemo(() => {
    if (activeFilter === 'All') return events;
    const chip = FILTERS.find((f) => f.label === activeFilter);
    if (!chip) return events;
    const allowed = new Set<Kind>(chip.kinds);
    return events.filter((e) => allowed.has(e.kind));
  }, [events, activeFilter]);

  return (
    <Card>
      <SectionHeader icon={<Activity size={14} />} title="Activity timeline" />
      <div className="flex flex-wrap gap-1.5 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setActiveFilter(f.label)}
            className={clsx(
              'inline-flex items-center h-7 px-2.5 rounded-md text-[12px] font-medium border transition-colors',
              activeFilter === f.label
                ? 'bg-primary text-white border-primary'
                : 'bg-surface text-ink-muted border-border hover:border-primary',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-bodysm text-ink-muted py-6">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-bodysm text-ink-muted py-6 text-center">
          {events.length === 0
            ? 'No activity yet.'
            : 'No matching activity in the selected filter.'}
        </div>
      ) : (
        <ol className="relative pl-5 space-y-3">
          {/* Timeline rail */}
          <span
            className="absolute left-1.5 top-0 bottom-0 w-px bg-border"
            aria-hidden
          />
          {filtered.map((e, idx) => (
            <ActivityRow
              key={`${e.kind}:${eventId(e)}:${idx}`}
              event={e}
              leadId={leadId}
              onOpenEmail={onOpenEmail}
            />
          ))}
        </ol>
      )}
    </Card>
  );
}

function eventId(e: LeadActivityEvent): string {
  switch (e.kind) {
    case 'lead_created':
      return 'lead-created';
    case 'stage_changed':
      return `${e.fromStage}-${e.toStage}`;
    case 'email_sent':
    case 'email_opened':
    case 'email_replied':
      return e.emailLogId;
    case 'call_logged':
      return e.callId;
    case 'meeting_scheduled':
    case 'meeting_completed':
    case 'meeting_cancelled':
      return e.meetingId;
    case 'proposal_sent':
      return e.proposalId;
    case 'task_created':
    case 'task_completed':
      return e.taskId;
    case 'note_added':
      return e.noteId;
    case 'sequence_enrolled':
    case 'sequence_exited':
      return e.sequenceId;
    case 'campaign_added':
      return e.campaignId;
  }
}

function ActivityRow({
  event,
  leadId,
  onOpenEmail,
}: {
  event: LeadActivityEvent;
  leadId: string;
  onOpenEmail?: (emailLogId: string) => void;
}) {
  const { Icon, tone, headline, detail, href, onClick } = renderEvent(
    event,
    leadId,
    onOpenEmail,
  );

  const inner = (
    <div className="flex items-start gap-2.5">
      <span
        className={clsx(
          'absolute left-0 mt-1 h-3 w-3 rounded-full border-2 border-surface flex items-center justify-center -translate-x-[2.5px]',
          tone === 'success' && 'bg-success',
          tone === 'primary' && 'bg-primary',
          tone === 'cyan' && 'bg-cyan-500',
          tone === 'warning' && 'bg-warning',
          tone === 'error' && 'bg-error',
          tone === 'neutral' && 'bg-neutral',
          tone === 'indigo' && 'bg-indigo-500',
        )}
        aria-hidden
      />
      <span
        className={clsx(
          'shrink-0 mt-0.5',
          tone === 'success' && 'text-success',
          tone === 'primary' && 'text-primary',
          tone === 'cyan' && 'text-cyan-600',
          tone === 'warning' && 'text-warning',
          tone === 'error' && 'text-error',
          tone === 'neutral' && 'text-neutral',
          tone === 'indigo' && 'text-indigo-600',
        )}
      >
        <Icon size={14} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-bodysm text-ink">{headline}</div>
        {detail && (
          <div className="text-caption text-ink-muted mt-0.5 truncate">
            {detail}
          </div>
        )}
      </div>
      <span
        className="text-caption text-ink-muted whitespace-nowrap shrink-0 mt-0.5"
        title={new Date(event.at).toLocaleString()}
      >
        {relativeTime(event.at)}
      </span>
    </div>
  );

  return (
    <li className="relative">
      {href ? (
        <Link href={href} className="block hover:bg-background/50 -mx-1 px-1 py-1 rounded-md">
          {inner}
        </Link>
      ) : onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="w-full text-left hover:bg-background/50 -mx-1 px-1 py-1 rounded-md"
        >
          {inner}
        </button>
      ) : (
        <div className="-mx-1 px-1 py-1">{inner}</div>
      )}
    </li>
  );
}

function renderEvent(
  event: LeadActivityEvent,
  leadId: string,
  onOpenEmail?: (emailLogId: string) => void,
): {
  Icon: LucideIcon;
  tone: 'success' | 'primary' | 'cyan' | 'warning' | 'error' | 'neutral' | 'indigo';
  headline: React.ReactNode;
  detail?: React.ReactNode;
  href?: string;
  onClick?: () => void;
} {
  switch (event.kind) {
    case 'lead_created':
      return {
        Icon: UserPlus,
        tone: 'primary',
        headline: <strong>Lead created</strong>,
        detail: event.leadName,
      };
    case 'stage_changed':
      return {
        Icon: GitBranch,
        tone: 'neutral',
        headline: (
          <span>
            Stage moved{' '}
            <span
              className={clsx(
                'inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium border align-middle',
                stageClass(event.fromStage),
              )}
            >
              {stageLabel(event.fromStage)}
            </span>{' '}
            →{' '}
            <span
              className={clsx(
                'inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium border align-middle',
                stageClass(event.toStage),
              )}
            >
              {stageLabel(event.toStage)}
            </span>
          </span>
        ),
        detail:
          event.trigger === 'manual'
            ? 'Manual'
            : `Automated · ${event.trigger.replace(/_/g, ' ')}`,
      };
    case 'email_sent':
      return {
        Icon: Send,
        tone: 'neutral',
        headline: (
          <>
            <strong>Email sent</strong> · {event.subject}
          </>
        ),
        detail: event.campaignName
          ? `From campaign: ${event.campaignName}`
          : event.sequenceName
          ? `From sequence: ${event.sequenceName}`
          : undefined,
        onClick: onOpenEmail
          ? () => onOpenEmail(event.emailLogId)
          : undefined,
      };
    case 'email_opened':
      return {
        Icon: MailOpen,
        tone: 'cyan',
        headline: (
          <>
            <strong>Email opened</strong>{' '}
            <span className="text-ink-muted">— {event.subject}</span>
          </>
        ),
        onClick: onOpenEmail
          ? () => onOpenEmail(event.emailLogId)
          : undefined,
      };
    case 'email_replied':
      return {
        Icon: Reply,
        tone: 'success',
        headline: (
          <>
            <strong>Reply received</strong>
            {event.fromEmail && (
              <span className="text-ink-muted"> from {event.fromEmail}</span>
            )}
          </>
        ),
        detail: event.snippet
          ? `“${event.snippet.slice(0, 140)}”`
          : undefined,
        onClick: onOpenEmail
          ? () => onOpenEmail(event.emailLogId)
          : undefined,
      };
    case 'call_logged': {
      const Icon =
        event.direction === 'outbound' ? PhoneOutgoing : PhoneIncoming;
      return {
        Icon,
        tone: event.direction === 'outbound' ? 'primary' : 'success',
        headline: (
          <>
            <strong>
              {event.direction === 'outbound' ? 'Outbound call' : 'Inbound call'}
            </strong>
            {event.outcome && (
              <span className="text-ink-muted">
                {' '}
                — {event.outcome.replace(/_/g, ' ')}
              </span>
            )}
          </>
        ),
        detail: event.notesPreview ?? undefined,
      };
    }
    case 'meeting_scheduled':
      return {
        Icon: CalendarPlus,
        tone: 'primary',
        headline: (
          <>
            <strong>Meeting scheduled</strong> · {event.meetingTitle}
          </>
        ),
        detail: new Date(event.scheduledAt).toLocaleString(),
      };
    case 'meeting_completed':
      return {
        Icon: CalendarCheck,
        tone: 'success',
        headline: (
          <>
            <strong>Meeting completed</strong> · {event.meetingTitle}
          </>
        ),
      };
    case 'meeting_cancelled':
      return {
        Icon: CalendarX,
        tone: 'warning',
        headline: (
          <>
            <strong>Meeting cancelled</strong> · {event.meetingTitle}
          </>
        ),
      };
    case 'proposal_sent':
      return {
        Icon: FileText,
        tone: 'indigo',
        headline: (
          <>
            <strong>Proposal sent</strong> · {event.subject}
          </>
        ),
      };
    case 'task_created':
      return {
        Icon: CheckSquare,
        tone: 'primary',
        headline: (
          <>
            <strong>Task created</strong> · {event.taskTitle}
          </>
        ),
        detail: event.dueAt
          ? `Due ${new Date(event.dueAt).toLocaleDateString()}`
          : undefined,
      };
    case 'task_completed':
      return {
        Icon: CheckCircle2,
        tone: 'success',
        headline: (
          <>
            <strong>Task done</strong> · {event.taskTitle}
          </>
        ),
      };
    case 'note_added':
      return {
        Icon: StickyNote,
        tone: 'neutral',
        headline: <strong>Note added</strong>,
        detail: event.bodyPreview,
      };
    case 'sequence_enrolled':
      return {
        Icon: Workflow,
        tone: 'primary',
        headline: (
          <>
            <strong>Enrolled in sequence</strong> · {event.sequenceName}
          </>
        ),
        href: `/campaigns/sequences/${event.sequenceId}`,
      };
    case 'sequence_exited':
      return {
        Icon: LogOut,
        tone: 'warning',
        headline: (
          <>
            <strong>Sequence ended</strong> · {event.sequenceName}
          </>
        ),
        detail: event.exitReason ?? undefined,
        href: `/campaigns/sequences/${event.sequenceId}`,
      };
    case 'campaign_added':
      return {
        Icon: Megaphone,
        tone: 'primary',
        headline: (
          <>
            <strong>Added to campaign</strong> · {event.campaignName}
          </>
        ),
        href: `/campaigns/${event.campaignId}`,
      };
  }
}
