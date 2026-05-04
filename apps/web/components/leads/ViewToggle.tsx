'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { Columns3, Table } from 'lucide-react';

const TABLE_PATH = '/leads';
const PIPELINE_PATH = '/lead-stage';

/**
 * Two-icon toggle that swaps between the leads table view and the
 * kanban pipeline view. Preserves the current query string so a
 * filtered view carries over when the user switches.
 *
 * Phase 19 — switched from <Link> to programmatic navigation so the
 * search-params snapshot is always current at click time, and the
 * already-active button disables itself instead of rendering as a
 * no-op anchor.
 */
export function ViewToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // Treat any `/leads` path (including `/leads/<id>`) as the table side
  // so the toggle keeps a sensible active state on lead detail.
  const onTable =
    pathname === TABLE_PATH || pathname.startsWith(`${TABLE_PATH}/`);
  const onPipeline = pathname === PIPELINE_PATH;

  const go = (target: string) => {
    if (
      (target === TABLE_PATH && pathname === TABLE_PATH) ||
      (target === PIPELINE_PATH && pathname === PIPELINE_PATH)
    ) {
      return;
    }
    const qs = sp.toString();
    router.push(qs ? `${target}?${qs}` : target);
  };

  return (
    <div
      className="inline-flex border border-border rounded-md overflow-hidden h-9"
      role="group"
      aria-label="View toggle"
    >
      <button
        type="button"
        onClick={() => go(TABLE_PATH)}
        title="Table view"
        aria-pressed={onTable}
        className={clsx(
          'px-2.5 inline-flex items-center justify-center transition-colors',
          onTable
            ? 'bg-primary text-white'
            : 'bg-surface text-ink-muted hover:bg-background hover:text-primary',
        )}
      >
        <Table size={14} />
      </button>
      <button
        type="button"
        onClick={() => go(PIPELINE_PATH)}
        title="Pipeline view"
        aria-pressed={onPipeline}
        className={clsx(
          'px-2.5 inline-flex items-center justify-center transition-colors border-l border-border',
          onPipeline
            ? 'bg-primary text-white'
            : 'bg-surface text-ink-muted hover:bg-background hover:text-primary',
        )}
      >
        <Columns3 size={14} />
      </button>
    </div>
  );
}
