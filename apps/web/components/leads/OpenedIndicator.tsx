'use client';

import { Eye, EyeOff } from 'lucide-react';
import { relativeTime } from '@/lib/time';

/**
 * Used in BOTH the email history row and the detail drawer so the open
 * status reads the same everywhere. Always shows something — whether
 * the email was opened (with timestamp + relative) or not opened yet.
 */
export function OpenedIndicator({
  openedAt,
  size = 'sm',
}: {
  openedAt: string | null | undefined;
  size?: 'sm' | 'md';
}) {
  const dim = size === 'md' ? 13 : 11;
  if (openedAt) {
    const d = new Date(openedAt);
    return (
      <span
        className="inline-flex items-center gap-1 text-success"
        title={d.toString()}
      >
        <Eye size={dim} />
        <span className="font-medium">Opened</span>
        <span className="font-mono font-tabular">
          {formatDateTime(d)}
        </span>
        <span className="text-neutral">({relativeTime(d)})</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-neutral">
      <EyeOff size={dim} />
      <span>Not opened yet</span>
    </span>
  );
}

function formatDateTime(d: Date): string {
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

