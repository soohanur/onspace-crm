'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  api,
  Confidence,
  ContactSource,
  ContactStatus,
  ContactType,
  LeadStage,
} from '@/lib/api';
import { activeContactFilterCount } from '@/lib/contact-filters';
import { useContactsFilter } from '@/hooks/useContactsFilter';
import { LEAD_STAGES, stageClass, stageLabel } from '@/lib/stages';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import {
  Check,
  ChevronDown,
  Filter,
  Search as SearchIcon,
  X,
} from 'lucide-react';

const CONTACT_TYPES: ContactType[] = ['owner', 'manager', 'staff', 'general'];
const CONTACT_STATUSES: ContactStatus[] = ['unverified', 'verified', 'invalid'];
const CONFIDENCES: Confidence[] = ['low', 'medium', 'high'];
const CONTACT_SOURCES: ContactSource[] = [
  'manual',
  'website',
  'directory',
  'enrichment',
];

const TYPE_LABEL: Record<ContactType, string> = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Staff',
  general: 'General',
};
const STATUS_LABEL: Record<ContactStatus, string> = {
  unverified: 'Unverified',
  verified: 'Verified',
  invalid: 'Invalid',
};
const CONFIDENCE_LABEL: Record<Confidence, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};
const SOURCE_LABEL: Record<ContactSource, string> = {
  manual: 'Manual',
  website: 'Website',
  directory: 'Directory',
  enrichment: 'Enrichment',
};

/**
 * Cross-lead contacts filter sidebar. Mirrors the LeadFilterPanel shape:
 * search box → contact-side multi-select chips → triple toggles → lead-side
 * typeahead + stage multi-select. Active filter count + clear up top.
 */
export function ContactFilterPanel() {
  const { filter, set, clear } = useContactsFilter();
  const { data: facets } = useQuery({
    queryKey: ['contacts-facets'],
    queryFn: api.getContactsFacets,
  });
  const count = activeContactFilterCount(filter);

  return (
    <Card className="!p-4 sticky top-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-caption uppercase tracking-wider text-neutral inline-flex items-center gap-1.5">
          <Filter size={12} /> Filters
          {count > 0 && (
            <span className="text-primary font-mono font-tabular">
              ({count})
            </span>
          )}
        </div>
        {count > 0 && (
          <button
            onClick={clear}
            className="text-caption text-ink-muted hover:text-error inline-flex items-center gap-1"
          >
            <X size={12} /> clear
          </button>
        )}
      </div>

      <div className="space-y-3">
        <Field label="Search">
          <div className="relative">
            <SearchIcon
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral pointer-events-none"
            />
            <Input
              placeholder="Name, email, phone, business…"
              value={filter.q ?? ''}
              onChange={(e) => set('q', e.target.value || undefined)}
              className="!pl-9"
            />
          </div>
        </Field>

        <Field label="Contact type">
          <ChipMulti
            options={CONTACT_TYPES}
            value={filter.contactType ?? []}
            onChange={(next) =>
              set('contactType', next.length ? next : undefined)
            }
            label={(v) => TYPE_LABEL[v]}
          />
        </Field>

        <Field label="Status">
          <ChipMulti
            options={CONTACT_STATUSES}
            value={filter.status ?? []}
            onChange={(next) => set('status', next.length ? next : undefined)}
            label={(v) => STATUS_LABEL[v]}
          />
        </Field>

        <Field label="Confidence">
          <ChipMulti
            options={CONFIDENCES}
            value={filter.confidence ?? []}
            onChange={(next) =>
              set('confidence', next.length ? next : undefined)
            }
            label={(v) => CONFIDENCE_LABEL[v]}
          />
        </Field>

        <Field label="Source">
          <ChipMulti
            options={CONTACT_SOURCES}
            value={filter.source ?? []}
            onChange={(next) => set('source', next.length ? next : undefined)}
            label={(v) => SOURCE_LABEL[v]}
          />
        </Field>

        <Field label="Has">
          <div className="space-y-1.5">
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
              label="LinkedIn"
              value={filter.hasLinkedin}
              onChange={(v) => set('hasLinkedin', v)}
            />
            <Triple
              label="Primary"
              value={filter.isPrimary}
              onChange={(v) => set('isPrimary', v)}
            />
          </div>
        </Field>

        <div className="pt-2 border-t border-border">
          <div className="text-caption uppercase tracking-wider text-neutral mb-2">
            Lead filters
          </div>
          <div className="space-y-3">
            <Field label="Lead category">
              <Typeahead
                value={filter.leadCategory ?? ''}
                onChange={(v) => set('leadCategory', v || undefined)}
                options={facets?.leadCategories ?? []}
                placeholder="Any category"
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Lead city">
                <Typeahead
                  value={filter.leadCity ?? ''}
                  onChange={(v) => set('leadCity', v || undefined)}
                  options={facets?.leadCities ?? []}
                  placeholder="Any"
                />
              </Field>
              <Field label="Lead state">
                <Typeahead
                  value={filter.leadState ?? ''}
                  onChange={(v) => set('leadState', v || undefined)}
                  options={facets?.leadStates ?? []}
                  placeholder="Any"
                />
              </Field>
            </div>

            <Field label="Lead stage">
              <StageMultiSelect
                value={filter.leadStage ?? []}
                onChange={(next) =>
                  set('leadStage', next.length ? next : undefined)
                }
              />
            </Field>
          </div>
        </div>
      </div>
    </Card>
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

function ChipMulti<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T[];
  onChange: (next: T[]) => void;
  label: (v: T) => string;
}) {
  const selected = new Set(value);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.has(o);
        return (
          <button
            key={o}
            onClick={() => {
              if (on) onChange(value.filter((v) => v !== o));
              else onChange([...value, o]);
            }}
            className={clsx(
              'inline-flex items-center h-7 px-2.5 rounded-md text-[12px] font-medium border transition-colors',
              on
                ? 'bg-primary text-white border-primary'
                : 'bg-surface text-ink-muted border-border hover:border-primary',
            )}
          >
            {label(o)}
          </button>
        );
      })}
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
              'px-2.5 h-6 transition-colors ' +
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
        <ChevronDown
          size={12}
          className="text-neutral pointer-events-none ml-auto"
        />
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
