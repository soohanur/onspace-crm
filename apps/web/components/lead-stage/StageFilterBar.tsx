'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useLeadsFilter } from '@/hooks/useLeadsFilter';
import { Search, X } from 'lucide-react';

/**
 * Inline filter strip for the /lead-stage page. Sits above the stage
 * tabs and writes through to the URL via useLeadsFilter, so the active
 * stage's table reflects every selection. Country / city / category
 * options come from /api/leads/facets.
 */
export function StageFilterBar() {
  const { filter, set, replace } = useLeadsFilter();
  const { data: facets } = useQuery({
    queryKey: ['lead-facets'],
    queryFn: api.facets,
    staleTime: 5 * 60 * 1000,
  });

  const clearable =
    !!filter.q ||
    !!filter.city ||
    !!filter.country ||
    !!filter.category ||
    !!filter.hasWebsite ||
    filter.ratingMin !== undefined;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search
          size={13}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral pointer-events-none"
          aria-hidden
        />
        <input
          type="search"
          value={filter.q ?? ''}
          onChange={(e) => set('q', e.target.value || undefined)}
          placeholder="Search business name…"
          className="h-9 pl-7 pr-3 w-64 text-bodysm rounded-md border border-border bg-surface focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition"
          aria-label="Search business name"
        />
      </div>

      <Select
        ariaLabel="Filter by city"
        value={filter.city ?? ''}
        onChange={(v) => set('city', v || undefined)}
        placeholder="City"
        options={facets?.cities ?? []}
      />
      <Select
        ariaLabel="Filter by country"
        value={filter.country ?? ''}
        onChange={(v) => set('country', v || undefined)}
        placeholder="Country"
        options={facets?.countries ?? []}
      />
      <Select
        ariaLabel="Filter by category"
        value={filter.category ?? ''}
        onChange={(v) => set('category', v || undefined)}
        placeholder="Category"
        options={facets?.categories ?? []}
      />

      <Select
        ariaLabel="Minimum rating"
        value={filter.ratingMin !== undefined ? String(filter.ratingMin) : ''}
        onChange={(v) => set('ratingMin', v ? Number(v) : undefined)}
        placeholder="Rating"
        options={['5', '4', '3', '2', '1']}
        renderOption={(o) => `${o}+ stars`}
      />

      <Select
        ariaLabel="Website filter"
        value={filter.hasWebsite ?? ''}
        onChange={(v) =>
          set('hasWebsite', v === 'true' || v === 'false' ? v : undefined)
        }
        placeholder="Website"
        options={['true', 'false']}
        renderOption={(o) => (o === 'true' ? 'Has website' : 'No website')}
      />

      <Select
        ariaLabel="Sort order"
        value={filter.orderBy ?? ''}
        onChange={(v) =>
          set(
            'orderBy',
            v === 'recent' || v === 'name' || v === 'rating' || v === 'years'
              ? v
              : undefined,
          )
        }
        placeholder="Sort"
        options={['recent', 'name', 'rating', 'years']}
        renderOption={(o) =>
          ({
            recent: 'Most recent',
            name: 'A → Z',
            rating: 'Top rated',
            years: 'Years in business',
          }[o] ?? o)
        }
      />

      {clearable && (
        <button
          type="button"
          onClick={() =>
            replace({
              // keep stage selection (driven by tab) and groupId untouched
              stage: filter.stage,
              groupId: filter.groupId,
              orderBy: filter.orderBy,
            })
          }
          className="inline-flex items-center gap-1 h-9 px-2 text-caption text-ink-muted hover:text-error"
        >
          <X size={12} /> Clear
        </button>
      )}
    </div>
  );
}

function Select({
  value,
  onChange,
  placeholder,
  options,
  renderOption,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
  renderOption?: (option: string) => string;
  ariaLabel: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 px-2 text-bodysm rounded-md border border-border bg-surface focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {renderOption ? renderOption(o) : o}
        </option>
      ))}
    </select>
  );
}
