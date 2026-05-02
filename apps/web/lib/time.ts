/**
 * Shared "X ago" formatter. Accepts a Date or an ISO string so callers
 * don't have to convert. Falls back to a localized date once the gap
 * exceeds 30 days — long-stale rows shouldn't read "734d ago".
 */
export function relativeTime(input: Date | string): string {
  const d = input instanceof Date ? input : new Date(input);
  const t = d.getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}
