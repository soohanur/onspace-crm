'use client';

// useSearchParams() inside useLeadsFilter requires a Suspense boundary
// for prerender — wrap the body and force-dynamic the route.
export const dynamic = 'force-dynamic';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LeadsTable } from '@/components/LeadsTable';
import { LeadsActionsMenu } from '@/components/leads/LeadsActionsMenu';
import { LeadsFilterModal } from '@/components/leads/LeadsFilterModal';
import { useLeadsFilter } from '@/hooks/useLeadsFilter';
import { useColumnPrefs } from '@/hooks/useColumnPrefs';
import { activeFilterCount, filterToSearchParams } from '@/lib/filters';
import { Search, Trash2, X } from 'lucide-react';

export default function GlobalLeadsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-[1700px] mx-auto px-6 py-6 text-ink-muted">
          Loading…
        </div>
      }
    >
      <GlobalLeadsBody />
    </Suspense>
  );
}

function GlobalLeadsBody() {
  const qc = useQueryClient();
  const { filter, set } = useLeadsFilter();
  const { visible } = useColumnPrefs();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);

  const filterParams = useMemo(
    () => Object.fromEntries(filterToSearchParams(filter).entries()),
    [filter],
  );
  const filterKey = useMemo(() => JSON.stringify(filterParams), [filterParams]);

  const { data: stats } = useQuery({
    queryKey: ['leads-stats-global', filterKey],
    queryFn: () => api.leadStats(filterParams),
    refetchInterval: 10_000,
  });

  // Infinite scroll — load a page at a time, append on intersection at
  // the table-bottom sentinel. PAGE_SIZE=50 keeps each fetch fast.
  const PAGE_SIZE = 50;
  const list = useInfiniteQuery({
    queryKey: ['leads-global', filterKey],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.listLeads({
        ...filterParams,
        take: PAGE_SIZE,
        cursor: pageParam ?? undefined,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? null,
  });
  const isLoading = list.isLoading;
  const items = useMemo(
    () => list.data?.pages.flatMap((p) => p.items) ?? [],
    [list.data?.pages],
  );

  const { data: facets } = useQuery({
    queryKey: ['facets'],
    queryFn: api.facets,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['leads-global'] });
    qc.invalidateQueries({ queryKey: ['leads-stats-global'] });
  };

  const deleteOne = useMutation({
    mutationFn: (id: string) => api.deleteLead(id),
    onSuccess: () => {
      setSelected(new Set());
      refresh();
    },
  });
  const bulkDelete = useMutation({
    mutationFn: (ids: string[]) => api.bulkDeleteLeads(ids),
    onSuccess: () => {
      setSelected(new Set());
      refresh();
    },
  });

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((l) => l.id)));
  };
  const clearSelection = () => setSelected(new Set());

  // Filter button badge counts only filters that aren't surfaced inline
  // (search + category live in the toolbar above the modal trigger).
  const totalActive = activeFilterCount(filter);
  const inlineActive =
    (filter.q ? 1 : 0) + (filter.category ? 1 : 0);
  const modalActive = Math.max(0, totalActive - inlineActive);

  return (
    <div className="h-full flex flex-col max-w-[1700px] mx-auto w-full px-6 py-4 gap-3 min-h-0">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 shrink-0">
        <StatCard label="Total" value={stats?.total ?? 0} />
        <StatCard label="With Website" value={stats?.withWebsite ?? 0} />
        <StatCard label="With Email" value={stats?.withEmail ?? 0} />
        <StatCard label="With Phone" value={stats?.withPhone ?? 0} />
        <StatCard label="With Social" value={stats?.withSocials ?? 0} />
      </div>

      <Card className="!p-0 overflow-hidden flex-1 min-h-0 flex flex-col">
        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-2 shrink-0">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral pointer-events-none"
            />
            <Input
              placeholder="Search…"
              value={filter.q ?? ''}
              onChange={(e) => set('q', e.target.value || undefined)}
              className="!pl-9 !h-9"
            />
          </div>
          <CategoryTypeahead
            value={filter.category ?? ''}
            onChange={(v) => set('category', v || undefined)}
            options={facets?.categories ?? []}
          />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="text-caption text-ink-muted font-tabular">
              {isLoading ? 'Loading…' : `${items.length} shown`}
              {selected.size > 0 && (
                <>
                  {' · '}
                  <button
                    onClick={clearSelection}
                    className="text-primary hover:underline"
                  >
                    {selected.size} selected (clear)
                  </button>
                </>
              )}
            </div>
            {selected.size > 0 && (
              <Button
                variant="secondary"
                onClick={() => {
                  if (
                    confirm(
                      `Delete ${selected.size} lead${selected.size === 1 ? '' : 's'}? This cannot be undone.`,
                    )
                  ) {
                    bulkDelete.mutate(Array.from(selected));
                  }
                }}
                className="!text-error !border-error hover:!bg-errorBg"
              >
                <Trash2 size={14} /> Delete ({selected.size})
              </Button>
            )}
            <LeadsActionsMenu
              filter={filter}
              selectedIds={Array.from(selected)}
              onClearSelection={clearSelection}
              onOpenFilters={() => setFilterOpen(true)}
              filterBadge={modalActive}
            />
          </div>
        </div>

        <LeadsTable
          leads={items}
          visibleColumns={visible}
          selectable
          selectedIds={selected}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          onDelete={(id) => deleteOne.mutate(id)}
          fillHeight
          hasMore={list.hasNextPage}
          isFetchingMore={list.isFetchingNextPage}
          onLoadMore={() => list.fetchNextPage()}
        />
      </Card>

      <LeadsFilterModal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
      />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="!p-3">
      <div className="text-caption uppercase tracking-wider text-neutral mb-1">
        {label}
      </div>
      <div className="text-h2 font-mono font-tabular">
        {value.toLocaleString()}
      </div>
    </Card>
  );
}

function CategoryTypeahead({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
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
    <div ref={wrapRef} className="relative w-[200px]">
      <input
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setOpen(true);
          if (e.target.value === '') onChange('');
        }}
        onFocus={() => setOpen(true)}
        placeholder="Any category"
        className="h-9 w-full pl-2.5 pr-7 rounded-md border border-border bg-surface text-bodysm text-ink placeholder:text-neutral focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition truncate"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            setDraft('');
            onChange('');
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral hover:text-error"
          aria-label="Clear category"
        >
          <X size={12} />
        </button>
      )}
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

