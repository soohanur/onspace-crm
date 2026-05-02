import {
  Calendar,
  MapPin,
  Phone,
  Video,
  type LucideIcon,
} from 'lucide-react';
import type {
  MeetingBucket,
  MeetingStatus,
  MeetingType,
} from './api';

export const MEETING_TYPES: MeetingType[] = [
  'phone',
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

export const MEETING_BUCKETS: MeetingBucket[] = [
  'upcoming',
  'today',
  'past',
  'cancelled',
];

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
  upcoming: 'Upcoming',
  today: 'Today',
  past: 'Past',
  cancelled: 'Cancelled',
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
