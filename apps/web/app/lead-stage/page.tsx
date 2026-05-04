'use client';

// useSearchParams() inside useLeadsFilter requires Suspense + dynamic
// for Next.js 15 prerender.
export const dynamic = 'force-dynamic';

import {
  Suspense,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { RefreshCcw } from 'lucide-react';
import { api, Lead, LeadStage, LeadsPage } from '@/lib/api';
import { LEAD_STAGES } from '@/lib/stages';
import { useLeadsFilter } from '@/hooks/useLeadsFilter';
import { filterToSearchParams } from '@/lib/filters';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LeadsFilterModal } from '@/components/leads/LeadsFilterModal';
import { ViewToggle } from '@/components/leads/ViewToggle';
import { Filter } from 'lucide-react';
import { activeFilterCount } from '@/lib/filters';
import { SaveAsSmartGroupButton } from '@/components/groups/SaveAsSmartGroupButton';
import { StageColumn } from '@/components/lead-stage/StageColumn';
import { LeadCard } from '@/components/lead-stage/LeadCard';
import { LeadTasksDrawer } from '@/components/lead-stage/LeadTasksDrawer';

const PAGE_SIZE = 1000;

export default function LeadStagePage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-[1700px] mx-auto px-6 py-8 text-ink-muted">
          Loading…
        </div>
      }
    >
      <LeadStageBody />
    </Suspense>
  );
}

function LeadStageBody() {
  const qc = useQueryClient();
  const { filter } = useLeadsFilter();
  const filterParams = useMemo(
    () => Object.fromEntries(filterToSearchParams(filter).entries()),
    [filter],
  );

  // Single fetch, refetch on focus only — no 3s polling here, the
  // payload is heavier than the table.
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['leads-global', filterParams],
    queryFn: () => api.listLeads({ ...filterParams, take: PAGE_SIZE }),
    refetchOnWindowFocus: true,
  });

  const items = data?.items ?? [];
  const total = items.length;

  // Bulk task counts for visible cards. One round trip per render, keyed
  // by the sorted ID list so the cache hits across re-renders.
  const idsKey = useMemo(
    () => items.map((l) => l.id).sort().join(','),
    [items],
  );
  const { data: taskCounts } = useQuery({
    queryKey: ['lead-task-counts', idsKey],
    queryFn: () => api.taskOpenCounts(items.map((l) => l.id)),
    enabled: items.length > 0,
  });

  // Group by stage — memoized so re-renders during a drag don't re-bucket.
  const buckets = useMemo(() => {
    const out: Record<LeadStage, Lead[]> = {} as Record<LeadStage, Lead[]>;
    for (const stage of LEAD_STAGES) out[stage] = [];
    for (const lead of items) {
      const arr = out[lead.stage as LeadStage];
      if (arr) arr.push(lead);
    }
    return out;
  }, [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Don't start a drag on simple clicks (link navigation, button taps).
      activationConstraint: { distance: 5 },
    }),
  );

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingLead = useMemo(
    () => items.find((l) => l.id === draggingId) ?? null,
    [draggingId, items],
  );

  const updateStage = useMutation({
    mutationFn: (input: { id: string; stage: LeadStage }) =>
      api.updateLeadStage(input.id, input.stage),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['lead', vars.id] });
      qc.invalidateQueries({ queryKey: ['leads-global'] });
      qc.invalidateQueries({ queryKey: ['lead-task-counts'] });
    },
  });

  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const onDragStart = (e: DragStartEvent) => {
    setDraggingId(String(e.active.id));
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDraggingId(null);
    const leadId = String(e.active.id);
    const fromStage = e.active.data.current?.stage as LeadStage | undefined;
    const toStage = (e.over?.id as LeadStage | undefined) ?? null;
    if (!toStage || !fromStage || fromStage === toStage) return;
    if (!LEAD_STAGES.includes(toStage)) return;

    // Optimistic cache update. Reads the same query key the page reads
    // from — items will rebucket on the next memoization pass.
    const cacheKey = ['leads-global', filterParams];
    const prev = qc.getQueryData<LeadsPage>(cacheKey);
    if (prev) {
      qc.setQueryData<LeadsPage>(cacheKey, {
        ...prev,
        items: prev.items.map((l) =>
          l.id === leadId ? { ...l, stage: toStage } : l,
        ),
      });
    }

    updateStage.mutate(
      { id: leadId, stage: toStage },
      {
        onError: (err) => {
          // Roll back on failure
          if (prev) qc.setQueryData(cacheKey, prev);
          setToast(
            `Couldn't move card: ${err instanceof Error ? err.message : 'unknown error'}`,
          );
        },
      },
    );
  };

  // Drawer state.
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterCount = activeFilterCount(filter);

  return (
    <div className="max-w-[1700px] mx-auto px-6 py-6 space-y-4">
      <Card className="!p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex flex-wrap gap-2 items-center">
          <button
            onClick={() => setFilterOpen(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-surface text-bodysm text-ink-muted hover:border-primary hover:text-primary"
          >
            <Filter size={13} />
            Filters
            {filterCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded bg-primary text-white text-[10px] font-mono font-tabular">
                {filterCount}
              </span>
            )}
          </button>
          <ViewToggle />
          <div className="ml-auto flex gap-2 flex-wrap items-center">
            <div className="text-caption text-ink-muted font-tabular">
              {isLoading
                ? 'Loading…'
                : `${total.toLocaleString()} lead${total === 1 ? '' : 's'}`}
              {data && total >= PAGE_SIZE && (
                <span className="ml-2 text-warning">
                  (capped at {PAGE_SIZE} — narrow filters)
                </span>
              )}
            </div>
            <SaveAsSmartGroupButton filter={filter} />
            <Button
              variant="secondary"
              onClick={() => refetch()}
              className="!h-9 !min-w-0 !px-3"
              disabled={isFetching}
              title="Refresh"
            >
              <RefreshCcw
                size={14}
                className={isFetching ? 'animate-spin' : undefined}
              />
            </Button>
          </div>
        </div>

            <DndContext
              sensors={sensors}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragCancel={() => setDraggingId(null)}
            >
              <div className="overflow-x-auto scroll-thin">
                <div className="flex gap-3 px-3 py-3 min-w-max">
                  {LEAD_STAGES.map((stage) => (
                    <StageColumn
                      key={stage}
                      stage={stage}
                      leads={buckets[stage]}
                      taskCounts={taskCounts ?? {}}
                      draggingId={draggingId}
                      onOpenTasks={(lead) => setDrawerLead(lead)}
                    />
                  ))}
                </div>
              </div>

          <DragOverlay dropAnimation={null}>
            {draggingLead ? (
              <div className="rotate-1">
                <LeadCard
                  lead={draggingLead}
                  openTaskCount={taskCounts?.[draggingLead.id] ?? 0}
                  onOpenTasks={() => {}}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </Card>

      <LeadsFilterModal open={filterOpen} onClose={() => setFilterOpen(false)} />

      {/* Tasks drawer */}
      <LeadTasksDrawer
        leadSummary={drawerLead}
        onClose={() => setDrawerLead(null)}
      />

      {/* Tiny inline toast */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-[60] max-w-sm bg-error text-white text-bodysm px-4 py-2.5 rounded-md shadow-e3"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
