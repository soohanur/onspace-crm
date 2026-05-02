'use client';

import { Eye, EyeOff } from 'lucide-react';

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

function relativeTime(d: Date): string {
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
