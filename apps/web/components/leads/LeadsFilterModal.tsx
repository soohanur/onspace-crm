'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { api, LeadStage } from '@/lib/api';
import { LeadFilter } from '@/lib/filters';
import { useLeadsFilter } from '@/hooks/useLeadsFilter';
import { LEAD_STAGES, stageClass, stageLabel } from '@/lib/stages';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Check, ChevronDown, X } from 'lucide-react';

/**
 * Phase 19 — pop-out modal containing every filter that's not surfaced
 * inline on the /leads toolbar (search + category live in the toolbar).
 * Filter state stays bound to the URL via useLeadsFilter so applying
 * just closes the modal — there's no separate "Apply" mutation step.
 */
export function LeadsFilterModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { filter, set, clear } = useLeadsFilter();
  const { data: facets } = useQuery({
    queryKey: ['facets'],
    queryFn: api.facets,
  });

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-lg shadow-e3 w-full max-w-xl max-h-[92vh] overflow-auto">
        <header className="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <h2 className="text-h3">Filters</h2>
          <button
            onClick={onClose}
            className="text-neutral hover:text-error"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <Field label="Stage">
            <StageMultiSelect
              value={filter.stage ?? []}
              onChange={(next) =>
                set('stage', next.length ? next : undefined)
              }
            />
          </Field>

          <Field label="Validity">
            <div className="flex border border-border rounded-md overflow-hidden text-caption">
              {(
                [
                  { v: undefined, label: 'All' },
                  { v: 'valid', label: 'Valid' },
                  { v: 'invalid', label: 'Invalid' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => set('validity', opt.v)}
                  className={clsx(
                    'flex-1 px-2.5 h-8 transition-colors',
                    filter.validity === opt.v
                      ? 'bg-primary text-white font-medium'
                      : 'bg-surface text-ink-muted hover:bg-background',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="City">
              <Typeahead
                value={filter.city ?? ''}
                onChange={(v) => set('city', v || undefined)}
                options={facets?.cities ?? []}
                placeholder="Any"
              />
            </Field>
            <Field label="State">
              <Typeahead
                value={filter.state ?? ''}
                onChange={(v) => set('state', v || undefined)}
                options={facets?.states ?? []}
                placeholder="Any"
              />
            </Field>
          </div>

          <Field label="Has">
            <div className="space-y-1.5">
              <Triple
                label="Website"
                value={filter.hasWebsite}
                onChange={(v) => set('hasWebsite', v)}
              />
              <Triple
                label="Email"
                value={filter.hasEmail}
                onChange={(v) => set('hasEmail', v)}
              />
              <Triple
                label="Phone"
                value={filter.hasPhone}
                onChange={(v) => set('hasPhone', v)}
              />
              <Triple
                label="Social"
                value={filter.hasSocials}
                onChange={(v) => set('hasSocials', v)}
              />
              <Triple
                label="Claimed"
                value={filter.claimed}
                onChange={(v) => set('claimed', v)}
              />
            </div>
          </Field>

          <Field label="Rating (0–5)">
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                placeholder="min"
                min={0}
                max={5}
                step={0.5}
                value={filter.ratingMin ?? ''}
                onChange={(e) =>
                  set(
                    'ratingMin',
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
                className="!h-9 !text-bodysm !px-2"
              />
              <span className="text-neutral text-caption">to</span>
              <Input
                type="number"
                placeholder="max"
                min={0}
                max={5}
                step={0.5}
                value={filter.ratingMax ?? ''}
                onChange={(e) =>
                  set(
                    'ratingMax',
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
                className="!h-9 !text-bodysm !px-2"
              />
            </div>
          </Field>

          <Field label="Years in business">
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                placeholder="min"
                min={0}
                value={filter.yearsMin ?? ''}
                onChange={(e) =>
                  set(
                    'yearsMin',
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
                className="!h-9 !text-bodysm !px-2"
              />
              <span className="text-neutral text-caption">to</span>
              <Input
                type="number"
                placeholder="max"
                min={0}
                value={filter.yearsMax ?? ''}
                onChange={(e) =>
                  set(
                    'yearsMax',
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
                className="!h-9 !text-bodysm !px-2"
              />
            </div>
          </Field>

          <Field label="Score">
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                placeholder="min"
                min={0}
                max={100}
                value={filter.scoreMin ?? ''}
                onChange={(e) =>
                  set(
                    'scoreMin',
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
                className="!h-9 !text-bodysm !px-2"
              />
              <span className="text-neutral text-caption">to</span>
              <Input
                type="number"
                placeholder="max"
                min={0}
                max={100}
                value={filter.scoreMax ?? ''}
                onChange={(e) =>
                  set(
                    'scoreMax',
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
                className="!h-9 !text-bodysm !px-2"
              />
            </div>
          </Field>

          <Field label="Sort by">
            <select
              value={filter.orderBy ?? 'recent'}
              onChange={(e) =>
                set('orderBy', e.target.value as LeadFilter['orderBy'])
              }
              className="h-9 px-2 w-full rounded-md border border-border bg-surface text-bodysm text-ink focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition"
            >
              <option value="recent">Most recent</option>
              <option value="name">Name (A→Z)</option>
              <option value="rating">Rating (high→low)</option>
              <option value="years">Years (high→low)</option>
            </select>
          </Field>
        </div>

        <footer className="px-5 py-3.5 border-t border-border flex items-center justify-between">
          <button
            onClick={() => clear()}
            className="text-caption text-ink-muted hover:text-error inline-flex items-center gap-1"
          >
            <X size={12} /> Clear all
          </button>
          <Button onClick={onClose}>Apply</Button>
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-caption uppercase tracking-wider text-neutral mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}

function Triple({
  label,
  value,
  onChange,
}: {
  label: string;
  value: 'true' | 'false' | undefined;
  onChange: (v: 'true' | 'false' | undefined) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-bodysm">
      <span className="text-ink truncate">{label}</span>
      <div className="flex border border-border rounded-md overflow-hidden text-caption shrink-0">
        {(
          [
            { v: undefined, label: 'Any' },
            { v: 'true', label: 'Yes' },
            { v: 'false', label: 'No' },
          ] as const
        ).map((opt) => (
          <button
            key={opt.label}
            onClick={() => onChange(opt.v)}
            className={
              'px-2.5 h-7 transition-colors ' +
              (value === opt.v
                ? 'bg-primary text-white font-medium'
                : 'bg-surface text-ink-muted hover:bg-background')
            }
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StageMultiSelect({
  value,
  onChange,
}: {
  value: LeadStage[];
  onChange: (next: LeadStage[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const selected = new Set(value);
  const matches = LEAD_STAGES.filter((s) =>
    draft.length === 0
      ? true
      : stageLabel(s).toLowerCase().includes(draft.toLowerCase()) ||
        s.includes(draft.toLowerCase()),
  );

  const toggle = (s: LeadStage) => {
    if (selected.has(s)) onChange(value.filter((x) => x !== s));
    else onChange([...value, s]);
  };

  return (
    <div ref={wrapRef} className="relative">
      <div
        onClick={() => setOpen(true)}
        className="min-h-[36px] w-full px-2 py-1 rounded-md border border-border bg-surface flex items-center gap-1 flex-wrap cursor-text focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 transition"
      >
        {value.map((s) => (
          <span
            key={s}
            className={clsx(
              'inline-flex items-center gap-1 h-6 px-1.5 rounded-md text-[11px] font-medium border',
              stageClass(s),
            )}
          >
            {stageLabel(s)}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggle(s);
              }}
              className="opacity-70 hover:opacity-100"
              aria-label={`Remove ${stageLabel(s)}`}
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={value.length ? '' : 'Any stage'}
          className="flex-1 min-w-[80px] h-7 bg-transparent text-bodysm focus:outline-none placeholder:text-neutral"
        />
        <ChevronDown size={12} className="text-neutral pointer-events-none ml-auto" />
      </div>
      {open && matches.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 bg-surface border border-border rounded-md shadow-e2 z-30 overflow-hidden max-h-[280px] overflow-y-auto scroll-thin">
          {matches.map((s) => {
            const checked = selected.has(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  toggle(s);
                  setDraft('');
                }}
                className="w-full flex items-center gap-2 px-3 h-8 text-bodysm hover:bg-background"
              >
                <span
                  className={clsx(
                    'inline-flex items-center justify-center h-3.5 w-3.5 rounded border',
                    checked
                      ? 'bg-primary border-primary text-white'
                      : 'border-border bg-surface',
                  )}
                  aria-hidden
                >
                  {checked && <Check size={10} />}
                </span>
                <span
                  className={clsx(
                    'inline-block h-2 w-2 rounded-full border',
                    stageClass(s),
                  )}
                />
                <span>{stageLabel(s)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Typeahead({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const matches =
    draft.length === 0
      ? options.slice(0, 8)
      : options
          .filter((o) => o.toLowerCase().includes(draft.toLowerCase()))
          .slice(0, 8);

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
            if (e.target.value === '') onChange('');
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches.length > 0) {
              onChange(matches[0]);
              setOpen(false);
            }
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder={placeholder}
          className="h-9 w-full pl-2.5 pr-7 rounded-md border border-border bg-surface text-bodysm text-ink placeholder:text-neutral focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition truncate"
        />
        {value ? (
          <button
            type="button"
            onClick={() => {
              setDraft('');
              onChange('');
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
        <div className="absolute left-0 right-0 mt-1 bg-surface border border-border rounded-md shadow-e2 z-30 overflow-hidden max-h-[280px] overflow-y-auto scroll-thin">
          {matches.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                setDraft(opt);
                onChange(opt);
                setOpen(false);
              }}
              className="w-full text-left px-3 h-8 text-bodysm hover:bg-background truncate"
              title={opt}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
