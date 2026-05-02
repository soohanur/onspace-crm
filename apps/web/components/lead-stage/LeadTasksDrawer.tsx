'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { api, Lead } from '@/lib/api';
import { LeadTasksPanel } from '@/components/leads/LeadTasksPanel';
import { StageBadge } from '@/components/leads/StageBadge';

/**
 * Right-side slide-out drawer that shows the clicked lead's follow-ups.
 * Reuses `LeadTasksPanel` (which already handles its own list / form /
 * cache invalidation) — the drawer only owns the open/close + portal
 * scaffolding so the kanban's overflow-x-scroll container doesn't clip
 * the drawer.
 */
export function LeadTasksDrawer({
  leadSummary,
  onClose,
}: {
  leadSummary: Lead | null;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Fetch the FULL lead row when the drawer is open. The summary that the
  // kanban hands us has every field already, but we re-fetch so embedded
  // `tasks` are present and the LeadTasksPanel doesn't have to wait for
  // its own first load.
  const { data: lead } = useQuery({
    queryKey: ['lead', leadSummary?.id],
    queryFn: () => api.getLead(leadSummary!.id),
    enabled: !!leadSummary?.id,
  });

  // Esc to close.
  useEffect(() => {
    if (!leadSummary) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [leadSummary, onClose]);

  if (!leadSummary || !mounted) return null;

  // Use the freshly-fetched lead if available so the panel sees current
  // tasks; fall back to the click-time summary on first paint.
  const display = lead ?? leadSummary;

  const ui = (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={clsx(
          'fixed top-0 right-0 z-50 h-screen w-[420px] max-w-[100vw] bg-background border-l border-border shadow-e3 flex flex-col',
        )}
        role="dialog"
        aria-label="Lead follow-ups"
      >
        <header className="px-4 h-14 border-b border-border flex items-center gap-2 bg-surface shrink-0">
          <Link
            href={`/leads/${display.id}`}
            className="font-medium text-ink hover:text-primary truncate"
            title={display.businessName}
          >
            {display.businessName}
          </Link>
          <StageBadge stage={display.stage} />
          <button
            onClick={onClose}
            className="ml-auto p-1.5 rounded-md text-neutral hover:text-error hover:bg-background"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 scroll-thin">
          {/* LeadTasksPanel is unmodified — same component used on the
              detail page. The Card it renders inside fits the drawer
              naturally. */}
          <LeadTasksPanel lead={display} />
        </div>
      </aside>
    </>
  );

  return createPortal(ui, document.body);
}
