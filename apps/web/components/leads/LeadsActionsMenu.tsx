'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Filter, FolderPlus, Save } from 'lucide-react';
import { LeadFilter } from '@/lib/filters';
import { SaveAsSmartGroupButton } from '@/components/groups/SaveAsSmartGroupButton';
import { AddToGroupMenu } from '@/components/groups/AddToGroupMenu';
import { LeadColumnToggle } from './LeadColumnToggle';

/**
 * Consolidates the four /leads toolbar actions behind a single "Actions"
 * dropdown so the toolbar stays clean. Each item delegates to the
 * existing component (its own popover handles state) — this wrapper
 * just gates them behind one click and keeps the toolbar tidy.
 */
export function LeadsActionsMenu({
  filter,
  selectedIds,
  onClearSelection,
  onOpenFilters,
  filterBadge,
}: {
  filter: LeadFilter;
  selectedIds: string[];
  onClearSelection: () => void;
  onOpenFilters: () => void;
  filterBadge?: number;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-surface text-bodysm text-ink hover:border-primary hover:text-primary transition-colors"
      >
        Actions
        <ChevronDown
          size={13}
          className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
        />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 w-64 bg-surface border border-border rounded-md shadow-e2 p-1.5 space-y-1">
          <button
            type="button"
            onClick={() => {
              onOpenFilters();
              setOpen(false);
            }}
            className="w-full flex items-center justify-between gap-2 h-9 px-2.5 rounded text-bodysm text-ink hover:bg-background"
          >
            <span className="inline-flex items-center gap-2">
              <Filter size={13} className="text-ink-muted" />
              Filters
            </span>
            {filterBadge !== undefined && filterBadge > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded bg-primary text-white text-[10px] font-mono font-tabular">
                {filterBadge}
              </span>
            )}
          </button>

          {/* The next three render their own popover triggers; they stay
              open as floating menus next to this panel. */}
          <div className="px-1 py-0.5">
            <LeadColumnToggle />
          </div>
          <div className="px-1 py-0.5">
            <AddToGroupMenu
              selectedIds={selectedIds}
              onAdded={() => {
                onClearSelection();
                setOpen(false);
              }}
            />
          </div>
          <div className="px-1 py-0.5">
            <SaveAsSmartGroupButton filter={filter} />
          </div>
        </div>
      )}
    </div>
  );
}

// Re-export icons consumers don't currently use to keep tree-shaking happy.
export const _icons = { FolderPlus, Save };
