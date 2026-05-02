import type {
  LeadStage,
  TaskBucket,
  TaskContext,
  TaskKind,
  TaskPriority,
  TaskStatus,
} from './api';

export const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
export const TASK_KINDS: TaskKind[] = ['general', 'followup'];
export const TASK_CONTEXTS: TaskContext[] = [
  'none',
  'approached_followup',
  'engaged_followup',
  'qualified_followup',
  'meeting_followup',
  'proposal_followup',
  'no_response_followup',
  'push_followup',
  'interested_followup',
];

export const TASK_BUCKETS: TaskBucket[] = ['today', 'overdue', 'upcoming', 'completed'];

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};
const PRIORITY_CLASSES: Record<TaskPriority, string> = {
  low: 'bg-gray-100 text-gray-700 border-gray-200',
  medium: 'bg-blue-100 text-blue-700 border-blue-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  urgent: 'bg-red-100 text-red-700 border-red-200',
};

export function priorityLabel(p: TaskPriority) {
  return PRIORITY_LABELS[p];
}
export function priorityClass(p: TaskPriority) {
  return PRIORITY_CLASSES[p];
}

const CONTEXT_LABELS: Record<TaskContext, string> = {
  none: 'No context',
  approached_followup: 'Approached follow-up',
  engaged_followup: 'Engaged follow-up',
  qualified_followup: 'Qualified follow-up',
  meeting_followup: 'Meeting follow-up',
  proposal_followup: 'Proposal follow-up',
  no_response_followup: 'No-response follow-up',
  push_followup: 'Push follow-up',
  interested_followup: 'Interested follow-up',
};
export function contextLabel(c: TaskContext) {
  return CONTEXT_LABELS[c];
}

const BUCKET_LABELS: Record<TaskBucket, string> = {
  today: 'Today',
  overdue: 'Overdue',
  upcoming: 'Upcoming',
  completed: 'Completed',
};
export function bucketLabel(b: TaskBucket) {
  return BUCKET_LABELS[b];
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  done: 'Done',
  cancelled: 'Cancelled',
};
export function statusLabel(s: TaskStatus) {
  return STATUS_LABELS[s];
}

/**
 * Default the follow-up context from a lead's current stage. The mapping
 * is conservative — stages without a dedicated context fall back to
 * `none`, which the user can still change in the form.
 */
export function defaultContextForStage(stage: LeadStage): TaskContext {
  switch (stage) {
    case 'approached':
      return 'approached_followup';
    case 'engaged':
      return 'engaged_followup';
    case 'qualified':
      return 'qualified_followup';
    case 'booked':
      return 'meeting_followup';
    case 'proposal_sent':
      return 'proposal_followup';
    case 'no_response':
      return 'no_response_followup';
    case 'push':
      return 'push_followup';
    case 'interested':
      return 'interested_followup';
    default:
      return 'none';
  }
}

/**
 * Render a due date relative to now: "Today 3pm", "Overdue 2d",
 * "in 4d", "Tomorrow 9am". Returns label + tone to drive color.
 */
export function dueLabel(dueAt: string | null, status: TaskStatus): {
  label: string;
  tone: 'overdue' | 'today' | 'future' | 'none' | 'done';
} {
  if (status === 'done') {
    return { label: 'Completed', tone: 'done' };
  }
  if (!dueAt) {
    return { label: 'No due date', tone: 'none' };
  }
  const d = new Date(dueAt);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (diffMs < 0) {
    const ago = -diffMs;
    if (ago < 60_000) return { label: 'Overdue · just now', tone: 'overdue' };
    if (ago < 3_600_000)
      return { label: `Overdue ${Math.floor(ago / 60_000)}m`, tone: 'overdue' };
    if (ago < 86_400_000)
      return { label: `Overdue ${Math.floor(ago / 3_600_000)}h`, tone: 'overdue' };
    return { label: `Overdue ${Math.floor(ago / 86_400_000)}d`, tone: 'overdue' };
  }
  if (isToday) {
    return { label: `Today ${time}`, tone: 'today' };
  }
  if (diffMs < 86_400_000 * 2) {
    return { label: `Tomorrow ${time}`, tone: 'future' };
  }
  if (diffMs < 86_400_000 * 7) {
    return { label: `in ${Math.floor(diffMs / 86_400_000)}d`, tone: 'future' };
  }
  return {
    label: d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
    tone: 'future',
  };
}
