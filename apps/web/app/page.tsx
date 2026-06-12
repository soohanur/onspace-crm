'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  api,
  CallDirection,
  CampaignStatus,
  DashboardEvent,
  DashboardSummary,
  LeadStage,
  MeetingType,
  Task,
  TaskContext,
} from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { StageBadge } from '@/components/leads/StageBadge';
import { stageClass, stageLabel } from '@/lib/stages';
import { contextLabel, dueLabel } from '@/lib/tasks';
import { relativeTime } from '@/lib/time';
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CalendarCheck,
  CalendarPlus,
  CheckCircle2,
  CheckSquare,
  ExternalLink,
  FileText,
  Inbox,
  ListTodo,
  Mail,
  MailOpen,
  Megaphone,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Reply,
  Send,
  TrendingUp,
  UserPlus,
  Users,
  Video,
} from 'lucide-react';

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-[1280px] mx-auto px-6 py-8 text-ink-muted">
          Loading…
        </div>
      }
    >
      <Body />
    </Suspense>
  );
}

function Body() {
  const summary = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: api.getDashboardSummary,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const activity = useQuery({
    queryKey: ['dashboard-activity', { limit: 20, days: 7 }],
    queryFn: () => api.getDashboardActivity({ limit: 20, days: 7 }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-6 space-y-4">
      <StatGrid summary={summary.data} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FollowUpsPanel />
        <StageFunnelPanel summary={summary.data} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <UpcomingMeetingsPanel summary={summary.data} />
        <ActiveCampaignsPanel summary={summary.data} />
      </div>

      <FollowUpContextsPanel summary={summary.data} />

      <ActivityPanel events={activity.data} loading={activity.isLoading} />
    </div>
  );
}

// ─── Stat strip ───────────────────────────────────────────────────────────

function StatGrid({ summary }: { summary: DashboardSummary | undefined }) {
  const t = summary?.today;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard
        icon={<CheckSquare size={14} />}
        label="Tasks due today"
        value={t?.tasksDueToday}
        href="/tasks?bucket=today"
      />
      <StatCard
        icon={<AlertTriangle size={14} className="text-warning" />}
        label="Overdue tasks"
        value={t?.overdueTasks}
        href="/tasks?bucket=overdue"
        tone={t && t.overdueTasks > 0 ? 'warning' : undefined}
      />
      <StatCard
        icon={<UserPlus size={14} />}
        label="New leads today"
        value={t?.leadsAddedToday}
        href="/leads?orderBy=recent"
      />
      <StatCard
        icon={<Send size={14} />}
        label="Sent today"
        value={t?.emailsSentToday}
        href="/email-activity"
      />
      <StatCard
        icon={<Reply size={14} />}
        label="Replies today"
        value={t?.repliesToday}
        href="/email-activity?filter=replied"
      />
      <StatCard
        icon={<MailOpen size={14} />}
        label="Opens today"
        value={t?.opensToday}
      />
      <StatCard
        icon={<Calendar size={14} />}
        label="Meetings today"
        value={t?.meetingsToday}
        href="/meetings?bucket=today"
      />
      <StatCard
        icon={<Phone size={14} />}
        label="Calls today"
        value={t?.callsToday}
        href="/calls?bucket=today"
      />
      <StatCard
        icon={<FileText size={14} />}
        label="Proposals sent"
        value={t?.proposalsSentToday}
      />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  href,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
  href?: string;
  tone?: 'warning';
}) {
  const inner = (
    <Card
      className={clsx(
        '!p-3 transition-colors',
        href && 'hover:border-primary cursor-pointer',
        tone === 'warning' && 'border-warning/40 bg-[#FEF4E5]',
      )}
    >
      <div className="text-caption text-neutral inline-flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="text-h2 font-mono font-tabular mt-1">
        {value === undefined ? (
          <span className="inline-block w-10 h-5 rounded bg-border/40 animate-pulse" />
        ) : (
          value.toLocaleString()
        )}
      </div>
    </Card>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

// ─── Follow-ups ──────────────────────────────────────────────────────────

function FollowUpsPanel() {
  const overdue = useQuery({
    queryKey: ['dashboard-tasks-overdue'],
    queryFn: () => api.listTasks({ bucket: 'overdue', take: 5 }),
    refetchInterval: 30_000,
  });
  const today = useQuery({
    queryKey: ['dashboard-tasks-today'],
    queryFn: () => api.listTasks({ bucket: 'today', take: 5 }),
    refetchInterval: 30_000,
  });

  const overdueItems = overdue.data?.items ?? [];
  const todayItems = today.data?.items ?? [];

  return (
    <Card className="!p-4">
      <SectionHeader
        icon={<ListTodo size={14} />}
        title="My follow-ups"
      />

      {/* Overdue */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-caption uppercase tracking-wider text-error">
            Overdue ({overdueItems.length})
          </span>
        </div>
        {overdueItems.length === 0 ? (
          <div className="text-caption text-ink-muted py-1">Nothing overdue</div>
        ) : (
          <ul className="space-y-1">
            {overdueItems.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
        )}
        {overdue.data?.nextCursor && (
          <Link
            href="/tasks?bucket=overdue"
            className="text-caption text-primary hover:underline mt-1 inline-block"
          >
            + more overdue →
          </Link>
        )}
      </div>

      {/* Today */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-caption uppercase tracking-wider text-warning">
            Today ({todayItems.length})
          </span>
        </div>
        {todayItems.length === 0 ? (
          <div className="text-caption text-ink-muted py-1">Nothing due today</div>
        ) : (
          <ul className="space-y-1">
            {todayItems.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
        )}
        {today.data?.nextCursor && (
          <Link
            href="/tasks?bucket=today"
            className="text-caption text-primary hover:underline mt-1 inline-block"
          >
            + more due today →
          </Link>
        )}
      </div>
    </Card>
  );
}

function TaskRow({ task }: { task: Task }) {
  const due = dueLabel(task.dueAt, task.status);
  const toneClass: Record<typeof due.tone, string> = {
    overdue: 'text-error',
    today: 'text-warning',
    future: 'text-ink',
    done: 'text-success',
    none: 'text-neutral',
  };
  return (
    <li className="flex items-center gap-2 text-bodysm">
      <Link
        href="/tasks"
        className="font-medium text-ink hover:text-primary truncate flex-1 min-w-0"
        title={task.title}
      >
        {task.title}
      </Link>
      {task.lead && (
        <Link
          href={`/leads/${task.lead.id}`}
          className="text-caption text-primary hover:underline truncate max-w-[180px]"
          title={task.lead.businessName}
        >
          {task.lead.businessName}
        </Link>
      )}
      <span
        className={clsx(
          'text-caption shrink-0 whitespace-nowrap',
          toneClass[due.tone],
        )}
      >
        {due.label}
      </span>
    </li>
  );
}

// ─── Stage Funnel ────────────────────────────────────────────────────────

function StageFunnelPanel({
  summary,
}: {
  summary: DashboardSummary | undefined;
}) {
  const rows = summary?.stageFunnel ?? [];
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <Card className="!p-4">
      <SectionHeader
        icon={<TrendingUp size={14} />}
        title="Stage funnel"
        right={
          <span className="text-caption text-ink-muted font-mono">
            {total.toLocaleString()} leads
          </span>
        }
      />

      {total === 0 ? (
        <div className="text-bodysm text-ink-muted py-3">No leads yet</div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.stage}>
              <Link
                href={`/lead-stage?stage=${r.stage}`}
                className="block group"
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-bodysm text-ink truncate flex-1">
                    {stageLabel(r.stage)}
                  </span>
                  <span className="text-caption font-mono font-tabular text-ink-muted shrink-0">
                    {r.count.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-background overflow-hidden">
                  <div
                    className={clsx(
                      'h-full rounded-full transition-all group-hover:opacity-80',
                      stageClass(r.stage),
                    )}
                    style={{
                      width: `${(r.count / max) * 100}%`,
                      minWidth: r.count > 0 ? 4 : 0,
                    }}
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ─── Upcoming meetings ───────────────────────────────────────────────────

function UpcomingMeetingsPanel({
  summary,
}: {
  summary: DashboardSummary | undefined;
}) {
  const items = summary?.upcomingMeetings ?? [];
  return (
    <Card className="!p-4">
      <SectionHeader
        icon={<Calendar size={14} />}
        title="Upcoming meetings"
        right={
          <Link
            href="/meetings?bucket=upcoming"
            className="text-caption text-primary hover:underline"
          >
            All →
          </Link>
        }
      />

      {items.length === 0 ? (
        <div className="text-bodysm text-ink-muted py-3">No upcoming meetings</div>
      ) : (
        <ul className="divide-y divide-border -mx-1">
          {items.map((m) => (
            <UpcomingMeetingRow key={m.id} meeting={m} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function UpcomingMeetingRow({
  meeting,
}: {
  meeting: DashboardSummary['upcomingMeetings'][number];
}) {
  const TypeIcon = meetingTypeIcon(meeting.type);
  const start = new Date(meeting.scheduledAt);
  const when = formatRelativeFuture(start);
  const dial = meetingJoinHref(meeting);
  return (
    <li className="px-1 py-2 flex items-start gap-2">
      <div className="mt-1 shrink-0">
        <TypeIcon size={13} className="text-ink-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <Link
          href={`/leads/${meeting.leadId}#calls`}
          className="text-bodysm font-medium text-ink hover:text-primary truncate inline-block max-w-full"
          title={meeting.title}
        >
          {meeting.title}
        </Link>
        <div className="text-caption text-ink-muted truncate">
          <Link
            href={`/leads/${meeting.leadId}`}
            className="text-primary hover:underline"
          >
            {meeting.leadBusinessName}
          </Link>
          <span> · {when}</span>
        </div>
      </div>
      {dial && (
        <a
          href={dial}
          target={dial.startsWith('tel:') ? undefined : '_blank'}
          rel="noreferrer"
          className="inline-flex items-center gap-1 h-6 px-2 rounded bg-primary text-white text-[11px] font-medium hover:bg-primary/90 shrink-0"
        >
          {meeting.type === 'phone' ? (
            <Phone size={10} />
          ) : (
            <Video size={10} />
          )}
          Join
        </a>
      )}
    </li>
  );
}

function meetingTypeIcon(t: MeetingType) {
  switch (t) {
    case 'phone':
      return Phone;
    case 'zoom':
    case 'google_meet':
      return Video;
    case 'in_person':
      return Users;
    default:
      return Calendar;
  }
}

function meetingJoinHref(meeting: {
  type: MeetingType;
  meetingLink: string | null;
}): string | null {
  const link = meeting.meetingLink?.trim() ?? '';
  if (meeting.type === 'phone') {
    if (!link) return null;
    const digits = link.replace(/[^+\d]/g, '');
    return digits ? `tel:${digits}` : null;
  }
  if (meeting.type === 'in_person') return null;
  if (link) {
    if (/^https?:\/\//i.test(link)) return link;
    return `https://${link}`;
  }
  return null;
}

function formatRelativeFuture(d: Date): string {
  const diffMs = d.getTime() - Date.now();
  if (diffMs <= 0) return 'now';
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const isToday = isSameDay(d, new Date());
  if (isToday) return `Today ${time}`;
  if (diffMs < 86_400_000 * 2) return `Tomorrow ${time}`;
  if (diffMs < 86_400_000 * 7)
    return `in ${Math.floor(diffMs / 86_400_000)}d, ${time}`;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ─── Active campaigns ────────────────────────────────────────────────────

function ActiveCampaignsPanel({
  summary,
}: {
  summary: DashboardSummary | undefined;
}) {
  const items = summary?.activeCampaigns ?? [];
  return (
    <Card className="!p-4">
      <SectionHeader
        icon={<Megaphone size={14} />}
        title="Active campaigns"
        right={
          <Link
            href="/campaigns"
            className="text-caption text-primary hover:underline"
          >
            All →
          </Link>
        }
      />

      {items.length === 0 ? (
        <div className="text-bodysm text-ink-muted py-3">No active campaigns</div>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <CampaignRow key={c.id} campaign={c} />
          ))}
        </ul>
      )}
    </Card>
  );
}

const CAMPAIGN_STATUS_CLASS: Record<CampaignStatus, string> = {
  draft: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  queued: 'bg-blue-100 text-blue-700 border-blue-200',
  running: 'bg-green-100 text-green-700 border-green-200',
  paused: 'bg-amber-100 text-amber-700 border-amber-200',
  completed: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
  cancelled: 'bg-zinc-100 text-zinc-700 border-zinc-200',
};

function CampaignRow({
  campaign,
}: {
  campaign: DashboardSummary['activeCampaigns'][number];
}) {
  const pct =
    campaign.recipientCount === 0
      ? 0
      : Math.round((campaign.sentCount / campaign.recipientCount) * 100);
  return (
    <li>
      <Link
        href={`/campaigns/${campaign.id}`}
        className="block hover:bg-background -mx-2 px-2 py-1.5 rounded-md group"
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-ink truncate flex-1 group-hover:text-primary">
            {campaign.name}
          </span>
          <span
            className={clsx(
              'inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium border whitespace-nowrap',
              CAMPAIGN_STATUS_CLASS[campaign.status],
            )}
          >
            {campaign.status}
          </span>
        </div>
        <div className="flex items-center gap-2 text-caption text-ink-muted">
          <span className="font-mono font-tabular">
            {campaign.sentCount}/{campaign.recipientCount}
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-background overflow-hidden">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="font-mono font-tabular">{pct}%</span>
        </div>
        <div className="text-caption text-ink-muted mt-0.5 flex gap-3">
          <span className="inline-flex items-center gap-1">
            <MailOpen size={10} /> {campaign.openedCount}
          </span>
          <span className="inline-flex items-center gap-1">
            <Reply size={10} /> {campaign.repliedCount}
          </span>
        </div>
      </Link>
    </li>
  );
}

// ─── Follow-up contexts ──────────────────────────────────────────────────

function FollowUpContextsPanel({
  summary,
}: {
  summary: DashboardSummary | undefined;
}) {
  const items = summary?.followUpContextCounts ?? [];
  return (
    <Card className="!p-4">
      <SectionHeader
        icon={<Inbox size={14} />}
        title="Open follow-ups by context"
      />

      {items.length === 0 ? (
        <div className="text-bodysm text-ink-muted py-3">No open follow-ups</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {items.map((r) => (
            <Link
              key={r.context}
              href={`/tasks?context=${r.context}`}
              className="flex items-center justify-between gap-2 px-3 h-10 rounded-md border border-border bg-surface hover:border-primary hover:bg-background transition-colors text-bodysm"
            >
              <span className="truncate">{contextLabel(r.context as TaskContext)}</span>
              <span className="text-primary font-mono font-tabular shrink-0">
                {r.count}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Activity feed ───────────────────────────────────────────────────────

function ActivityPanel({
  events,
  loading,
}: {
  events: DashboardEvent[] | undefined;
  loading: boolean;
}) {
  return (
    <Card className="!p-4">
      <SectionHeader
        icon={<TrendingUp size={14} />}
        title="Recent activity"
        right={
          <span className="text-caption text-ink-muted">last 7 days</span>
        }
      />

      {loading ? (
        <div className="text-bodysm text-ink-muted py-3">Loading…</div>
      ) : !events || events.length === 0 ? (
        <div className="text-bodysm text-ink-muted py-3">No recent activity</div>
      ) : (
        <ul className="divide-y divide-border -mx-1">
          {events.map((e) => (
            <ActivityRow key={`${e.kind}:${eventId(e)}:${e.at}`} event={e} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function eventId(e: DashboardEvent): string {
  switch (e.kind) {
    case 'lead_created':
      return e.leadId;
    case 'email_sent':
    case 'email_opened':
    case 'email_replied':
      return e.emailLogId;
    case 'task_completed':
      return e.taskId;
    case 'campaign_started':
      return e.campaignId;
    case 'meeting_scheduled':
    case 'meeting_completed':
      return e.meetingId;
    case 'call_logged':
      return e.callId;
    case 'proposal_sent':
      return e.proposalId;
  }
}

function ActivityRow({ event }: { event: DashboardEvent }) {
  const { icon, tone, message, href } = renderEvent(event);
  return (
    <li className="px-1 py-2 flex items-start gap-2.5">
      <span className={clsx('mt-0.5 shrink-0', tone)}>{icon}</span>
      <div className="flex-1 min-w-0 text-bodysm">
        {href ? (
          <Link href={href} className="text-ink hover:text-primary">
            {message}
          </Link>
        ) : (
          <span className="text-ink">{message}</span>
        )}
      </div>
      <span
        className="text-caption text-ink-muted whitespace-nowrap shrink-0"
        title={new Date(event.at).toLocaleString()}
      >
        {relativeTime(event.at)}
      </span>
    </li>
  );
}

function renderEvent(event: DashboardEvent): {
  icon: React.ReactNode;
  tone: string;
  message: React.ReactNode;
  href?: string;
} {
  switch (event.kind) {
    case 'lead_created':
      return {
        icon: <UserPlus size={14} />,
        tone: 'text-primary',
        message: (
          <>
            <strong className="font-medium">New lead</strong>{' '}
            <span className="text-ink-muted">·</span> {event.leadName}
          </>
        ),
        href: `/leads/${event.leadId}`,
      };
    case 'email_sent':
      return {
        icon: <Send size={14} />,
        tone: 'text-neutral',
        message: (
          <>
            <strong className="font-medium">Sent</strong>{' '}
            <span className="text-ink-muted">→</span> {event.leadName}{' '}
            <span className="text-ink-muted">·</span>{' '}
            <span className="text-ink-muted truncate">{event.subject}</span>
            {event.campaignName && (
              <span className="text-ink-muted"> · campaign {event.campaignName}</span>
            )}
          </>
        ),
        href: `/leads/${event.leadId}`,
      };
    case 'email_opened':
      return {
        icon: <MailOpen size={14} />,
        tone: 'text-cyan-600',
        message: (
          <>
            <strong className="font-medium">Opened</strong>{' '}
            <span className="text-ink-muted">·</span> {event.leadName}{' '}
            <span className="text-ink-muted truncate">— {event.subject}</span>
          </>
        ),
        href: `/leads/${event.leadId}`,
      };
    case 'email_replied':
      return {
        icon: <Reply size={14} />,
        tone: 'text-success',
        message: (
          <>
            <strong className="font-medium">Replied</strong>{' '}
            <span className="text-ink-muted">·</span> {event.leadName}
            {event.snippet && (
              <span className="text-ink-muted"> — “{event.snippet.slice(0, 80)}”</span>
            )}
          </>
        ),
        href: `/leads/${event.leadId}`,
      };
    case 'task_completed':
      return {
        icon: <CheckCircle2 size={14} />,
        tone: 'text-success',
        message: (
          <>
            <strong className="font-medium">Task done</strong>{' '}
            <span className="text-ink-muted">·</span> {event.taskTitle}{' '}
            <span className="text-ink-muted">— {event.leadName}</span>
          </>
        ),
        href: `/leads/${event.leadId}`,
      };
    case 'campaign_started':
      return {
        icon: <Megaphone size={14} />,
        tone: 'text-primary',
        message: (
          <>
            <strong className="font-medium">Campaign started</strong>{' '}
            <span className="text-ink-muted">·</span> {event.campaignName}
          </>
        ),
        href: `/campaigns/${event.campaignId}`,
      };
    case 'meeting_scheduled':
      return {
        icon: <CalendarPlus size={14} />,
        tone: 'text-primary',
        message: (
          <>
            <strong className="font-medium">Meeting scheduled</strong>{' '}
            <span className="text-ink-muted">·</span> {event.meetingTitle}{' '}
            <span className="text-ink-muted">— {event.leadName}</span>
          </>
        ),
        href: `/leads/${event.leadId}`,
      };
    case 'meeting_completed':
      return {
        icon: <CalendarCheck size={14} />,
        tone: 'text-success',
        message: (
          <>
            <strong className="font-medium">Meeting completed</strong>{' '}
            <span className="text-ink-muted">·</span> {event.meetingTitle}{' '}
            <span className="text-ink-muted">— {event.leadName}</span>
          </>
        ),
        href: `/leads/${event.leadId}`,
      };
    case 'call_logged': {
      const Icon =
        event.direction === 'outbound' ? PhoneOutgoing : PhoneIncoming;
      return {
        icon: <Icon size={14} />,
        tone: event.direction === 'outbound' ? 'text-primary' : 'text-success',
        message: (
          <>
            <strong className="font-medium">
              {event.direction === 'outbound' ? 'Outbound call' : 'Inbound call'}
            </strong>{' '}
            <span className="text-ink-muted">·</span> {event.leadName}
            {event.outcome && (
              <span className="text-ink-muted"> — {event.outcome.replace(/_/g, ' ')}</span>
            )}
          </>
        ),
        href: `/leads/${event.leadId}`,
      };
    }
    case 'proposal_sent':
      return {
        icon: <FileText size={14} />,
        tone: 'text-indigo-600',
        message: (
          <>
            <strong className="font-medium">Proposal sent</strong>{' '}
            <span className="text-ink-muted">·</span> {event.subject}{' '}
            <span className="text-ink-muted">— {event.leadName}</span>
          </>
        ),
        href: `/leads/${event.leadId}`,
      };
  }
}

// ─── Shared section header ───────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  right,
}: {
  icon: React.ReactNode;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <div className="text-caption uppercase tracking-wider text-neutral inline-flex items-center gap-1.5">
        {icon}
        {title}
      </div>
      {right}
    </div>
  );
}
