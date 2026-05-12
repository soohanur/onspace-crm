import {
  Calendar,
  CalendarCheck,
  CalendarOff,
  CalendarX,
  MapPin,
  Phone,
  Video,
  type LucideIcon,
} from 'lucide-react';
import type {
  Meeting,
  MeetingBucket,
  MeetingStatus,
  MeetingType,
} from './api';

// 'phone' is no longer offered as a new-meeting type (Zoom / Meet / in-person
// cover the cases). Legacy 'phone' rows still render via the label/icon maps.
export const MEETING_TYPES: MeetingType[] = [
  'zoom',
  'google_meet',
  'in_person',
  'other',
];

export const MEETING_STATUSES: MeetingStatus[] = [
  'scheduled',
  'completed',
  'cancelled',
  'no_show',
];

// "Serial" tabs in the order the page shows them.
export const MEETING_BUCKETS: MeetingBucket[] = [
  'today',
  'upcoming',
  'missed',
  'cancelled',
  'completed',
];

// Log-style views, shown after a divider.
export const MEETING_LOG_BUCKETS: MeetingBucket[] = ['this_month', 'all'];

const TYPE_LABELS: Record<MeetingType, string> = {
  phone: 'Phone',
  zoom: 'Zoom',
  google_meet: 'Google Meet',
  in_person: 'In person',
  other: 'Other',
};
export function meetingTypeLabel(t: MeetingType) {
  return TYPE_LABELS[t];
}

const TYPE_ICONS: Record<MeetingType, LucideIcon> = {
  phone: Phone,
  zoom: Video,
  google_meet: Video,
  in_person: MapPin,
  other: Calendar,
};
export function meetingTypeIcon(t: MeetingType): LucideIcon {
  return TYPE_ICONS[t];
}

const STATUS_LABELS: Record<MeetingStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};
export function meetingStatusLabel(s: MeetingStatus) {
  return STATUS_LABELS[s];
}

const STATUS_CLASSES: Record<MeetingStatus, string> = {
  scheduled: 'bg-blue-100 text-blue-700 border-blue-200',
  completed: 'bg-green-100 text-green-700 border-green-200',
  cancelled: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  no_show: 'bg-red-100 text-red-700 border-red-200',
};
export function meetingStatusClass(s: MeetingStatus) {
  return STATUS_CLASSES[s];
}

const BUCKET_LABELS: Record<MeetingBucket, string> = {
  today: 'Today',
  upcoming: 'Upcoming',
  missed: 'Missed',
  cancelled: 'Cancelled',
  completed: 'Completed',
  this_month: 'This month',
  all: 'All meetings',
};
export function bucketLabel(b: MeetingBucket) {
  return BUCKET_LABELS[b];
}

/**
 * Render the scheduledAt as a user-friendly relative time + a tone for
 * color (mirrors `dueLabel` in tasks.ts). Status tweaks the tone:
 * cancelled = muted, completed = success regardless of time.
 */
export function whenLabel(
  scheduledAt: string,
  status: MeetingStatus,
): { label: string; tone: 'past' | 'today' | 'future' | 'done' | 'muted' } {
  if (status === 'cancelled') {
    return { label: formatAbsolute(scheduledAt), tone: 'muted' };
  }
  if (status === 'completed') {
    return { label: `Completed · ${formatAbsolute(scheduledAt)}`, tone: 'done' };
  }
  const d = new Date(scheduledAt);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (status === 'no_show') {
    return { label: `No-show · ${formatAbsolute(scheduledAt)}`, tone: 'past' };
  }
  if (diffMs < 0) {
    const ago = -diffMs;
    if (ago < 3_600_000) return { label: `Started ${Math.floor(ago / 60_000)}m ago`, tone: 'past' };
    if (ago < 86_400_000) return { label: `${Math.floor(ago / 3_600_000)}h ago`, tone: 'past' };
    return { label: `${Math.floor(ago / 86_400_000)}d ago`, tone: 'past' };
  }
  if (isToday) return { label: `Today ${time}`, tone: 'today' };
  if (diffMs < 86_400_000 * 2) return { label: `Tomorrow ${time}`, tone: 'future' };
  if (diffMs < 86_400_000 * 7)
    return { label: `in ${Math.floor(diffMs / 86_400_000)}d, ${time}`, tone: 'future' };
  return { label: formatAbsolute(scheduledAt), tone: 'future' };
}

function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Resolve a join URL for a meeting based on its type. Phone numbers use
 * `tel:`, video meetings use whatever link the user / sync set, and we
 * fall back to the GCal htmlLink for everything else. Returns null when
 * there's nothing to click.
 */
export function meetingJoinHref(meeting: Meeting): string | null {
  const link = meeting.meetingLink?.trim() ?? '';
  if (meeting.type === 'phone') {
    if (!link) return null;
    const digits = link.replace(/[^+\d]/g, '');
    return digits ? `tel:${digits}` : null;
  }
  if (meeting.type === 'in_person') {
    return null;
  }
  if (link) {
    if (/^https?:\/\//i.test(link)) return link;
    return `https://${link}`;
  }
  return meeting.externalLink ?? null;
}

/**
 * Three-state Calendar-sync indicator. The retry-on-failure UX is wired
 * up at the row level — this helper just classifies state.
 */
export function syncBadge(meeting: Meeting): {
  state: 'synced' | 'failed' | 'none';
  label: string;
  className: string;
  icon: LucideIcon;
  tooltip: string;
} {
  if (meeting.externalEventId && !meeting.syncError) {
    return {
      state: 'synced',
      label: 'Synced to Calendar',
      className: 'bg-success/10 text-success border-success/20',
      icon: CalendarCheck,
      tooltip: meeting.externalLink
        ? 'Click the row to open in Google Calendar'
        : 'Synced to Google Calendar',
    };
  }
  if (meeting.syncError) {
    const isScopeIssue = /no calendar-scoped account/i.test(meeting.syncError);
    return {
      state: 'failed',
      label: isScopeIssue ? 'Not synced' : 'Sync failed',
      className: isScopeIssue
        ? 'bg-background text-neutral border-border'
        : 'bg-error/10 text-error border-error/20',
      icon: isScopeIssue ? CalendarOff : CalendarX,
      tooltip: meeting.syncError,
    };
  }
  return {
    state: 'none',
    label: 'Not synced',
    className: 'bg-background text-neutral border-border',
    icon: CalendarOff,
    tooltip: 'Not synced to Google Calendar',
  };
}
