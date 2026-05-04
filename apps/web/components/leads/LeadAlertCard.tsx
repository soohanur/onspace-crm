'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  api,
  Call,
  Lead,
  Meeting,
  SequenceEnrollment,
  Task,
} from '@/lib/api';
import { Card } from '../ui/Card';
import { SectionHeader } from './LeadOverviewCard';
import {
  AlertCircle,
  Bell,
  Calendar,
  Clock,
  Megaphone,
  Phone,
  Workflow,
} from 'lucide-react';

/**
 * Phase 19 — actionable callouts derived from the lead's current state.
 * Sits at the top of the right column on the lead detail page. Empty
 * state when nothing's pending so the card stays useful but quiet.
 *
 * Data-fetching strategy: we lean on the existing per-lead endpoints
 * (meetings / calls / tasks / sequences) which the panels below
 * already render. Each query uses the same key those panels do so we
 * share cache. Campaigns are looked up via the global campaign list +
 * a recipient query — cheap because campaigns are typically <10.
 */
export function LeadAlertCard({ lead }: { lead: Lead }) {
  const { data: meetings = [] } = useQuery<Meeting[]>({
    queryKey: ['lead-meetings', lead.id],
    queryFn: () => api.listLeadMeetings(lead.id),
    initialData: lead.meetings,
  });
  const { data: calls = [] } = useQuery<Call[]>({
    queryKey: ['lead-calls', lead.id],
    queryFn: () => api.listLeadCalls(lead.id),
    initialData: lead.calls,
  });
  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['lead-tasks', lead.id],
    queryFn: () => api.listLeadTasks(lead.id),
  });
  const { data: enrollments = [] } = useQuery<SequenceEnrollment[]>({
    queryKey: ['lead-sequences', lead.id],
    queryFn: () => api.listLeadSequences(lead.id),
  });

  const now = Date.now();

  const upcomingMeeting = meetings
    .filter(
      (m) =>
        m.status === 'scheduled' &&
        new Date(m.scheduledAt).getTime() > now,
    )
    .sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() -
        new Date(b.scheduledAt).getTime(),
    )[0];

  const upcomingCall = calls
    .filter(
      (c) =>
        c.status === 'scheduled' &&
        new Date(c.occurredAt).getTime() > now,
    )
    .sort(
      (a, b) =>
        new Date(a.occurredAt).getTime() -
        new Date(b.occurredAt).getTime(),
    )[0];

  const openTasks = tasks.filter(
    (t) => t.status === 'open' || t.status === 'in_progress',
  );
  // Most urgent: overdue first (oldest first), then today (earliest first),
  // then upcoming (earliest first). Tasks without a dueAt go last.
  const urgentTask = openTasks
    .slice()
    .sort((a, b) => {
      const ad = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
      const bd = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
      return ad - bd;
    })[0];

  const activeEnrollment = enrollments.find((e) => e.status === 'active');

  const alerts: AlertItem[] = [];
  if (upcomingMeeting) {
    alerts.push({
      icon: <Calendar size={13} className="text-primary" />,
      tone: 'primary',
      label: 'Meeting scheduled',
      detail: `${upcomingMeeting.title} · ${formatWhen(upcomingMeeting.scheduledAt)}`,
      href: '#meetings',
    });
  }
  if (upcomingCall) {
    alerts.push({
      icon: <Phone size={13} className="text-primary" />,
      tone: 'primary',
      label: 'Call scheduled',
      detail: formatWhen(upcomingCall.occurredAt),
      href: '#calls',
    });
  }
  if (urgentTask) {
    const tone =
      urgentTask.dueAt && new Date(urgentTask.dueAt).getTime() < now
        ? 'error'
        : urgentTask.dueAt && isToday(urgentTask.dueAt)
        ? 'warning'
        : 'primary';
    alerts.push({
      icon:
        tone === 'error' ? (
          <AlertCircle size={13} className="text-error" />
        ) : tone === 'warning' ? (
          <Clock size={13} className="text-warning" />
        ) : (
          <Clock size={13} className="text-primary" />
        ),
      tone,
      label:
        tone === 'error'
          ? 'Follow-up overdue'
          : tone === 'warning'
          ? 'Follow-up due today'
          : 'Follow-up coming up',
      detail: urgentTask.dueAt
        ? `${urgentTask.title} · ${formatWhen(urgentTask.dueAt)}`
        : urgentTask.title,
      href: '#tasks',
    });
  }
  if (activeEnrollment) {
    const total = activeEnrollment.sequence?._count?.steps ?? 0;
    alerts.push({
      icon: <Workflow size={13} className="text-primary" />,
      tone: 'primary',
      label: `Active sequence: ${activeEnrollment.sequence?.name ?? 'Sequence'}`,
      detail: total
        ? `Step ${activeEnrollment.nextStepOrder} of ${total}`
        : 'In progress',
      href: activeEnrollment.sequenceId
        ? `/campaigns/sequences/${activeEnrollment.sequenceId}`
        : '#sequences',
    });
  }

  return (
    <Card>
      <SectionHeader icon={<Bell size={14} />} title="Alerts" />
      {alerts.length === 0 ? (
        <div className="text-bodysm text-ink-muted py-3">
          No active alerts.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {alerts.map((a, idx) => (
            <li key={idx}>
              <Link
                href={a.href}
                className={clsx(
                  'flex items-start gap-2 px-2.5 py-2 rounded-md border text-bodysm transition-colors',
                  a.tone === 'error'
                    ? 'border-error/40 bg-error/5 hover:bg-error/10'
                    : a.tone === 'warning'
                    ? 'border-warning/40 bg-[#FEF4E5] hover:bg-[#FCEED2]'
                    : 'border-primary/30 bg-primary/5 hover:bg-primary/10',
                )}
              >
                <span className="mt-0.5 shrink-0">{a.icon}</span>
                <div className="min-w-0">
                  <div className="font-medium text-ink truncate">
                    {a.label}
                  </div>
                  <div className="text-caption text-ink-muted truncate">
                    {a.detail}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

interface AlertItem {
  icon: React.ReactNode;
  tone: 'primary' | 'warning' | 'error';
  label: string;
  detail: string;
  href: string;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const sameDay =
    d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today ${time}`;
  if (diff < 0) {
    const days = Math.ceil(-diff / 86_400_000);
    if (days < 1) return `${Math.ceil(-diff / 3_600_000)}h ago`;
    return `${days}d ago`;
  }
  if (diff < 86_400_000 * 2) return `Tomorrow ${time}`;
  if (diff < 86_400_000 * 7) {
    return `in ${Math.floor(diff / 86_400_000)}d, ${time}`;
  }
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}
