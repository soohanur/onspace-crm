'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, Lead } from '@/lib/api';
import { ChevronDown, X } from 'lucide-react';

/**
 * Lead picker for task forms. Debounces the query string so we don't hit
 * `/api/leads` on every keystroke. Selecting a lead emits its id.
 */
export function LeadTypeahead({
  value,
  onChange,
  placeholder = 'Search leads…',
}: {
  value: string | null;
  onChange: (leadId: string | null) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  // Resolve current value to a label.
  const { data: selected } = useQuery({
    queryKey: ['lead-pick', value],
    queryFn: () => api.getLead(value!),
    enabled: !!value,
  });

  // Debounced search results.
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(draft), 200);
    return () => clearTimeout(t);
  }, [draft]);

  const { data } = useQuery({
    queryKey: ['lead-search', debounced],
    queryFn: () =>
      api.listLeads({ q: debounced || undefined, take: 20 }),
    enabled: open,
  });

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const matches = data?.items ?? [];

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          value={selected && !open ? selected.businessName : draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
            if (e.target.value === '') onChange(null);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="h-10 w-full pl-3 pr-7 rounded-md border border-border bg-surface text-bodysm text-ink placeholder:text-neutral focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition truncate"
        />
        {value ? (
          <button
            type="button"
            onClick={() => {
              setDraft('');
              onChange(null);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral hover:text-error"
            aria-label="Clear"
          >
            <X size={12} />
          </button>
        ) : (
          <ChevronDown
            size={12}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral pointer-events-none"
          />
        )}
      </div>
      {open && matches.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 z-30 bg-surface border border-border rounded-md shadow-e2 max-h-[280px] overflow-y-auto scroll-thin">
          {matches.map((l: Lead) => (
            <button
              key={l.id}
              type="button"
              onClick={() => {
                onChange(l.id);
                setDraft('');
                setOpen(false);
              }}
              className="w-full text-left px-3 h-9 text-bodysm hover:bg-background"
            >
              <div className="truncate">{l.businessName}</div>
              <div className="text-caption text-neutral truncate">
                {[l.city, l.state].filter(Boolean).join(', ') || l.searchLocation}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
