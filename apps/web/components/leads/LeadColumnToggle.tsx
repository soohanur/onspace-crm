'use client';

import { useState, useRef, useEffect } from 'react';
import { Columns3, RotateCcw } from 'lucide-react';
import { ALL_COLUMNS, ColumnKey, useColumnPrefs } from '@/hooks/useColumnPrefs';

export function LeadColumnToggle() {
  const { visible, toggle, reset } = useColumnPrefs();
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
        onClick={() => setOpen((s) => !s)}
        className="h-11 px-3.5 rounded-md border border-border bg-surface text-bodysm inline-flex items-center gap-2 hover:border-primary hover:text-primary transition-colors"
      >
        <Columns3 size={14} />
        Columns
        <span className="text-caption text-neutral font-mono font-tabular">
          {visible.size}/{ALL_COLUMNS.length}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-30 bg-surface border border-border rounded-md shadow-e2 min-w-[200px] overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-caption uppercase tracking-wider text-neutral">
              Visible columns
            </span>
            <button
              onClick={reset}
              className="text-caption text-ink-muted hover:text-primary inline-flex items-center gap-1"
            >
              <RotateCcw size={11} />
              reset
            </button>
          </div>
          {ALL_COLUMNS.map((c) => (
            <label
              key={c.key}
              className="flex items-center gap-2 px-3 h-9 text-bodysm hover:bg-background cursor-pointer"
            >
              <input
                type="checkbox"
                checked={visible.has(c.key as ColumnKey)}
                onChange={() => toggle(c.key as ColumnKey)}
                className="accent-primary"
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
