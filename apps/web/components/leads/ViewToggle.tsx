'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { Columns3, Table } from 'lucide-react';

const TABLE_PATH = '/leads';
const PIPELINE_PATH = '/lead-stage';

/**
 * Two-icon toggle that swaps between the leads table view and the kanban
 * pipeline view. Preserves the current query string so a filtered view
 * carries over when the user switches.
 */
export function ViewToggle() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const qs = sp.toString();
  const tableHref = qs ? `${TABLE_PATH}?${qs}` : TABLE_PATH;
  const pipelineHref = qs ? `${PIPELINE_PATH}?${qs}` : PIPELINE_PATH;

  const activeTable = pathname === TABLE_PATH;
  const activePipeline = pathname === PIPELINE_PATH;

  return (
    <div className="inline-flex border border-border rounded-md overflow-hidden h-9">
      <Link
        href={tableHref}
        title="Table view"
        className={clsx(
          'px-2.5 inline-flex items-center justify-center transition-colors',
          activeTable
            ? 'bg-primary text-white'
            : 'bg-surface text-ink-muted hover:bg-background',
        )}
        aria-current={activeTable ? 'page' : undefined}
      >
        <Table size={14} />
      </Link>
      <Link
        href={pipelineHref}
        title="Pipeline view"
        className={clsx(
          'px-2.5 inline-flex items-center justify-center transition-colors border-l border-border',
          activePipeline
            ? 'bg-primary text-white'
            : 'bg-surface text-ink-muted hover:bg-background',
        )}
        aria-current={activePipeline ? 'page' : undefined}
      >
        <Columns3 size={14} />
      </Link>
    </div>
  );
}
