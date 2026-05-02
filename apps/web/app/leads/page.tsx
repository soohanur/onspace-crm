'use client';

// useSearchParams() inside useLeadsFilter requires a Suspense boundary
// for prerender — wrap the body and force-dynamic the route.
export const dynamic = 'force-dynamic';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Suspense, useState } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LeadsTable } from '@/components/LeadsTable';
import { LeadFilterPanel } from '@/components/leads/LeadFilterPanel';
import { LeadColumnToggle } from '@/components/leads/LeadColumnToggle';
import { ViewToggle } from '@/components/leads/ViewToggle';
import { AddToGroupMenu } from '@/components/groups/AddToGroupMenu';
import { SaveAsSmartGroupButton } from '@/components/groups/SaveAsSmartGroupButton';
import { useLeadsFilter } from '@/hooks/useLeadsFilter';
import { useColumnPrefs } from '@/hooks/useColumnPrefs';
import { filterToSearchParams } from '@/lib/filters';
import { Trash2 } from 'lucide-react';

export default function GlobalLeadsPage() {
  return (
    <Suspense fallback={<div className="max-w-[1700px] mx-auto px-6 py-8 text-ink-muted">Loading…</div>}>
      <GlobalLeadsBody />
    </Suspense>
  );
}

function GlobalLeadsBody() {
  const qc = useQueryClient();
  const { filter } = useLeadsFilter();
  const { visible } = useColumnPrefs();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filterParams = Object.fromEntries(filterToSearchParams(filter).entries());

  const { data: stats } = useQuery({
    queryKey: ['leads-stats-global', filterParams],
    queryFn: () => api.leadStats(filterParams),
    refetchInterval: 3_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['leads-global', filterParams],
    queryFn: () => api.listLeads({ ...filterParams, take: 200 }),
    refetchInterval: 3_000,
  });

  const items = data?.items ?? [];

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

  return (
    <div className="max-w-[1700px] mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-h1 mb-1">Global Leads</h1>
        <p className="text-ink-muted text-bodysm">
          All leads ever scraped, across every search.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <StatCard label="Total" value={stats?.total ?? 0} />
        <StatCard label="With Website" value={stats?.withWebsite ?? 0} />
        <StatCard label="With Email" value={stats?.withEmail ?? 0} />
        <StatCard label="With Phone" value={stats?.withPhone ?? 0} />
        <StatCard label="With Social" value={stats?.withSocials ?? 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        <aside className="hidden lg:block min-w-0">
          <LeadFilterPanel />
        </aside>

        <div className="min-w-0">
          <Card className="p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex flex-wrap gap-3 items-center">
              <div className="text-bodysm text-ink-muted font-tabular">
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
              <div className="ml-auto flex gap-2 flex-wrap items-center">
                <ViewToggle />
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
                <SaveAsSmartGroupButton filter={filter} />
                <AddToGroupMenu
                  selectedIds={Array.from(selected)}
                  onAdded={clearSelection}
                />
                <LeadColumnToggle />
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
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <div className="text-caption uppercase tracking-wider text-neutral mb-2">{label}</div>
      <div className="text-h1 font-mono font-tabular">{value.toLocaleString()}</div>
    </Card>
  );
}
