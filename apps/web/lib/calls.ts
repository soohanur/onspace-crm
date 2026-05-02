import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  type LucideIcon,
} from 'lucide-react';
import type {
  Call,
  CallBucket,
  CallDirection,
  CallOutcome,
  CallStatus,
} from './api';

export const CALL_DIRECTIONS: CallDirection[] = ['outbound', 'inbound'];

export const CALL_OUTCOMES: CallOutcome[] = [
  'answered',
  'no_answer',
  'voicemail',
  'busy',
  'wrong_number',
  'do_not_call',
  'scheduled_callback',
];

export const CALL_STATUSES: CallStatus[] = ['scheduled', 'completed', 'cancelled'];

export const CALL_BUCKETS: CallBucket[] = ['scheduled', 'today', 'recent', 'all'];

const DIRECTION_LABELS: Record<CallDirection, string> = {
  outbound: 'Outbound',
  inbound: 'Inbound',
};
export function directionLabel(d: CallDirection): string {
  return DIRECTION_LABELS[d];
}

const DIRECTION_ICONS: Record<CallDirection, LucideIcon> = {
  outbound: PhoneOutgoing,
  inbound: PhoneIncoming,
};
export function directionIcon(d: CallDirection): LucideIcon {
  return DIRECTION_ICONS[d];
}

const OUTCOME_LABELS: Record<CallOutcome, string> = {
  answered: 'Answered',
  no_answer: 'No answer',
  voicemail: 'Voicemail',
  busy: 'Busy',
  wrong_number: 'Wrong number',
  do_not_call: 'Do not call',
  scheduled_callback: 'Scheduled callback',
};
export function outcomeLabel(o: CallOutcome): string {
  return OUTCOME_LABELS[o];
}

const OUTCOME_CLASSES: Record<CallOutcome, string> = {
  answered: 'bg-green-100 text-green-700 border-green-200',
  voicemail: 'bg-blue-100 text-blue-700 border-blue-200',
  no_answer: 'bg-amber-100 text-amber-700 border-amber-200',
  busy: 'bg-amber-100 text-amber-700 border-amber-200',
  wrong_number: 'bg-red-100 text-red-700 border-red-200',
  do_not_call: 'bg-red-200 text-red-900 border-red-300',
  scheduled_callback: 'bg-indigo-100 text-indigo-700 border-indigo-200',
};
export function outcomeClass(o: CallOutcome): string {
  return OUTCOME_CLASSES[o];
}

const STATUS_LABELS: Record<CallStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
export function statusLabel(s: CallStatus): string {
  return STATUS_LABELS[s];
}

const STATUS_CLASSES: Record<CallStatus, string> = {
  scheduled: 'bg-blue-100 text-blue-700 border-blue-200',
  completed: 'bg-green-100 text-green-700 border-green-200',
  cancelled: 'bg-zinc-100 text-zinc-700 border-zinc-200',
};
export function statusClass(s: CallStatus): string {
  return STATUS_CLASSES[s];
}

const BUCKET_LABELS: Record<CallBucket, string> = {
  scheduled: 'Scheduled',
  today: 'Today',
  recent: 'Last 7 days',
  all: 'All',
};
export function bucketLabel(b: CallBucket): string {
  return BUCKET_LABELS[b];
}

/**
 * Relative-time render mirroring meetings.whenLabel. Tone drives color
 * in the row: past = error/red, today = warning/amber, future = ink,
 * cancelled = muted, completed = success.
 */
export function whenLabel(
  occurredAt: string,
  status: CallStatus,
): { label: string; tone: 'past' | 'today' | 'future' | 'done' | 'muted' } {
  if (status === 'cancelled') {
    return { label: formatAbsolute(occurredAt), tone: 'muted' };
  }
  const d = new Date(occurredAt);
  if (Number.isNaN(d.getTime())) return { label: '—', tone: 'muted' };
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (status === 'completed') {
    if (diffMs > -60_000) return { label: 'Just now', tone: 'done' };
    const ago = -diffMs;
    if (ago < 3_600_000) return { label: `${Math.floor(ago / 60_000)}m ago`, tone: 'done' };
    if (ago < 86_400_000) return { label: `${Math.floor(ago / 3_600_000)}h ago`, tone: 'done' };
    if (ago < 7 * 86_400_000)
      return { label: `${Math.floor(ago / 86_400_000)}d ago`, tone: 'done' };
    return { label: formatAbsolute(occurredAt), tone: 'done' };
  }

  // Scheduled in the future
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
  return { label: formatAbsolute(occurredAt), tone: 'future' };
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

/** Format mm:ss (or h:mm:ss for ≥ 1h). Null/0 → "—". */
export function formatDuration(durationSec: number | null): string {
  if (durationSec == null || durationSec < 0) return '—';
  if (durationSec === 0) return '0:00';
  const h = Math.floor(durationSec / 3600);
  const m = Math.floor((durationSec % 3600) / 60);
  const s = durationSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

/**
 * `tel:` href for outbound calls with a number on file. Inbound calls
 * don't get a dial button — there's no number to "call back" into a
 * conversation that already happened. Cancelled calls don't dial.
 */
export function callDialHref(call: Call): string | null {
  if (call.direction !== 'outbound') return null;
  if (call.status === 'cancelled') return null;
  const raw = call.toPhone?.trim() ?? '';
  if (!raw) return null;
  const digits = raw.replace(/[^+\d]/g, '');
  return digits ? `tel:${digits}` : null;
}

export const PHONE_INTEGRATION_TOOLTIP =
  'Phone integration coming later — opens in your default dialer for now.';

export const phoneIcon: LucideIcon = Phone;
