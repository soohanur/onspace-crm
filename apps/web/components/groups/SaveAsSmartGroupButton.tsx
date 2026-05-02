'use client';

import { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { LeadFilter, activeFilterCount } from '@/lib/filters';
import { Bookmark, Check } from 'lucide-react';

export function SaveAsSmartGroupButton({ filter }: { filter: LeadFilter }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const create = useMutation({
    mutationFn: () =>
      api.createGroup({
        name: name.trim(),
        type: 'smart',
        filterDsl: filter as Record<string, unknown>,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      setOpen(false);
      setName('');
    },
  });

  const disabled = activeFilterCount(filter) === 0;

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => !disabled && setOpen((s) => !s)}
        disabled={disabled}
        className="h-11 px-4 rounded-md border border-border bg-surface text-bodysm font-medium inline-flex items-center gap-2 hover:border-primary hover:text-primary transition-colors disabled:opacity-50 disabled:pointer-events-none"
        title={disabled ? 'Set some filters first' : 'Save current filter as smart group'}
      >
        <Bookmark size={14} />
        Save as smart group
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-30 bg-surface border border-border rounded-md shadow-e2 p-3 min-w-[280px]">
          <div className="text-caption uppercase tracking-wider text-neutral mb-2">
            Smart group from current filter
          </div>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Hot LA Plumbers"
            className="w-full h-10 px-3 text-bodysm rounded-md border border-border bg-surface focus:outline-none focus:border-primary mb-2"
          />
          <button
            onClick={() => name.trim() && create.mutate()}
            disabled={!name.trim() || create.isPending}
            className="w-full h-10 rounded-md bg-primary text-white text-bodysm font-medium hover:bg-primary-hover disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            {create.isPending ? 'Saving…' : (
              <>
                <Check size={14} /> Save group
              </>
            )}
          </button>
          {create.error && (
            <div className="text-error text-caption mt-2">
              {(create.error as Error).message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
