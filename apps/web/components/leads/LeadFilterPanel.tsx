'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { LeadFilter, activeFilterCount } from '@/lib/filters';
import { useLeadsFilter } from '@/hooks/useLeadsFilter';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Filter, X } from 'lucide-react';

export function LeadFilterPanel() {
  const { filter, set, clear } = useLeadsFilter();
  const { data: facets } = useQuery({ queryKey: ['facets'], queryFn: api.facets });

  const count = activeFilterCount(filter);

  return (
    <Card className="!p-4 sticky top-4">
      <div className="flex items-center justify-between mb-4">
        <div className="text-caption uppercase tracking-wider text-neutral inline-flex items-center gap-1.5">
          <Filter size={12} /> Filters
          {count > 0 && (
            <span className="text-primary font-mono font-tabular">({count})</span>
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

      <div className="space-y-4">
        <div>
          <Label>Search</Label>
          <Input
            placeholder="Business, category, city…"
            value={filter.q ?? ''}
            onChange={(e) => set('q', e.target.value || undefined)}
          />
        </div>

        <div>
          <Label>Category</Label>
          <Select
            value={filter.category ?? ''}
            onChange={(e) => set('category', e.target.value || undefined)}
          >
            <option value="">All categories</option>
            {facets?.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>City</Label>
            <Select
              value={filter.city ?? ''}
              onChange={(e) => set('city', e.target.value || undefined)}
            >
              <option value="">All</option>
              {facets?.cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>State</Label>
            <Select
              value={filter.state ?? ''}
              onChange={(e) => set('state', e.target.value || undefined)}
            >
              <option value="">All</option>
              {facets?.states.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <FieldGroup label="Has">
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
        </FieldGroup>

        <div>
          <Label>Rating range</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              placeholder="min"
              min={0}
              max={5}
              step={0.5}
              value={filter.ratingMin ?? ''}
              onChange={(e) =>
                set('ratingMin', e.target.value ? Number(e.target.value) : undefined)
              }
            />
            <Input
              type="number"
              placeholder="max"
              min={0}
              max={5}
              step={0.5}
              value={filter.ratingMax ?? ''}
              onChange={(e) =>
                set('ratingMax', e.target.value ? Number(e.target.value) : undefined)
              }
            />
          </div>
        </div>

        <div>
          <Label>Years in business</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              placeholder="min"
              min={0}
              value={filter.yearsMin ?? ''}
              onChange={(e) =>
                set('yearsMin', e.target.value ? Number(e.target.value) : undefined)
              }
            />
            <Input
              type="number"
              placeholder="max"
              min={0}
              value={filter.yearsMax ?? ''}
              onChange={(e) =>
                set('yearsMax', e.target.value ? Number(e.target.value) : undefined)
              }
            />
          </div>
        </div>

        <div>
          <Label>Sort by</Label>
          <Select
            value={filter.orderBy ?? 'recent'}
            onChange={(e) => set('orderBy', e.target.value as LeadFilter['orderBy'])}
          >
            <option value="recent">Most recent</option>
            <option value="name">Name (A→Z)</option>
            <option value="rating">Rating (high→low)</option>
            <option value="years">Years (high→low)</option>
          </Select>
        </div>
      </div>
    </Card>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-caption uppercase tracking-wider text-neutral mb-1">{children}</div>
  );
}

function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="space-y-1.5">{children}</div>
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
    <div className="flex items-center justify-between gap-2">
      <span className="text-bodysm">{label}</span>
      <div className="flex border border-border rounded-md overflow-hidden text-caption">
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
              'px-2 h-6 transition-colors ' +
              (value === opt.v
                ? 'bg-primary text-white'
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
