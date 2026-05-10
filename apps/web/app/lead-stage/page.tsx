'use client';

// useSearchParams() inside useLeadsFilter requires Suspense + dynamic
// for Next.js 15 prerender.
export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { RefreshCcw } from 'lucide-react';
import { api, Lead, LeadStage } from '@/lib/api';
import { LEAD_STAGES, stageClass, stageLabel } from '@/lib/stages';
import { useLeadsFilter } from '@/hooks/useLeadsFilter';
import { useColumnPrefs } from '@/hooks/useColumnPrefs';
import { useStageLastSeen } from '@/hooks/useStageLastSeen';
import { filterToSearchParams } from '@/lib/filters';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ViewToggle } from '@/components/leads/ViewToggle';
import { LeadsTable } from '@/components/LeadsTable';
import { StageFilterBar } from '@/components/lead-stage/StageFilterBar';

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
  const { filter } = useLeadsFilter();
  const { visible } = useColumnPrefs();
  const { seen, markSeen } = useStageLastSeen();

  const [activeStage, setActiveStage] = useState<LeadStage>(LEAD_STAGES[0]);

  // Mark the active stage read whenever the user lands on or switches to it.
  // Done in an effect (not in the click handler) so the very first render
  // also clears the badge for the default tab.
  useEffect(() => {
    markSeen(activeStage);
  }, [activeStage, markSeen]);

  // Strip URL stage from filter so the tab drives stage selection.
  // Pass the active stage explicitly to the API.
  const filterParams = useMemo(() => {
    const { stage: _ignored, ...rest } = filter;
    const params = Object.fromEntries(
      filterToSearchParams(rest).entries(),
    );
    return params;
  }, [filter]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['leads-by-stage', activeStage, filterParams],
    queryFn: () =>
      api.listLeads({
        ...filterParams,
        stage: activeStage,
        take: String(PAGE_SIZE),
      }),
    refetchOnWindowFocus: true,
  });

  // Per-stage counts for the tab badges. One filter-aware request per
  // stage; cached together by query key.
  const { data: counts } = useQuery({
    queryKey: ['leads-by-stage-counts', filterParams],
    queryFn: async () => {
      const out: Record<LeadStage, number> = {} as Record<LeadStage, number>;
      await Promise.all(
        LEAD_STAGES.map(async (stage) => {
          const stats = await api.leadStats({
            ...filterParams,
            stage,
          });
          out[stage] = stats.total;
        }),
      );
      return out;
    },
    refetchOnWindowFocus: true,
  });

  // Per-stage *unread* counts — leads that entered the stage after the
  // user's last visit. Hidden when the user has never seen that tab
  // (so we don't drown the UI in red dots on first load).
  const seenSig = useMemo(
    () =>
      LEAD_STAGES.map((s) => `${s}:${seen[s] ?? ''}`).join('|'),
    [seen],
  );
  const { data: unread } = useQuery({
    queryKey: ['leads-by-stage-unread', filterParams, seenSig],
    queryFn: async () => {
      const out: Record<LeadStage, number> = {} as Record<LeadStage, number>;
      await Promise.all(
        LEAD_STAGES.map(async (stage) => {
          const since = seen[stage];
          if (!since) {
            out[stage] = 0;
            return;
          }
          const stats = await api.leadStats({
            ...filterParams,
            stage,
            stageChangedSince: since,
          });
          out[stage] = stats.total;
        }),
      );
      return out;
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const items: Lead[] = data?.items ?? [];
  const total = items.length;

  return (
    <div className="max-w-[1700px] mx-auto px-6 py-6 space-y-3">
      {/* Filter strip */}
      <Card className="!p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StageFilterBar />
          <div className="flex items-center gap-2">
            <ViewToggle />
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
      </Card>

      {/* Stage tabs */}
      <div
        className="flex gap-1.5 overflow-x-auto scroll-thin py-1"
        role="tablist"
        aria-label="Lead stages"
      >
        {LEAD_STAGES.map((stage) => {
          const active = stage === activeStage;
          const count = counts?.[stage];
          // Unread badge only shows on inactive tabs (the active one has
          // already been marked seen by the effect above).
          const unreadCount = !active ? unread?.[stage] ?? 0 : 0;
          return (
            <button
              key={stage}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveStage(stage)}
              className={clsx(
                'relative inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-bodysm border transition-colors whitespace-nowrap',
                active
                  ? clsx(stageClass(stage), 'shadow-e1 font-medium')
                  : unreadCount > 0
                  ? 'bg-primary/5 text-primary border-primary/40 font-semibold ring-2 ring-primary/15 hover:border-primary'
                  : 'bg-surface text-ink-muted border-border font-medium hover:border-primary',
              )}
            >
              {!active && unreadCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-primary text-white text-[9px] font-mono font-tabular shadow-e1"
                  aria-label={`${unreadCount} new`}
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
              {stageLabel(stage)}
              {count !== undefined && (
                <span
                  className={clsx(
                    'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded text-[10px] font-mono font-tabular',
                    active
                      ? 'bg-white/30 text-current'
                      : unreadCount > 0
                      ? 'bg-primary/10 text-primary border border-primary/30'
                      : 'bg-background text-neutral border border-border',
                  )}
                >
                  {count.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active-stage table */}
      <Card className="!p-0 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <div className="text-caption text-ink-muted font-tabular">
            {isLoading
              ? 'Loading…'
              : `${total.toLocaleString()} ${stageLabel(activeStage).toLowerCase()} lead${
                  total === 1 ? '' : 's'
                }`}
            {data && total >= PAGE_SIZE && (
              <span className="ml-2 text-warning">
                (capped at {PAGE_SIZE} — narrow filters)
              </span>
            )}
          </div>
        </div>
        <LeadsTable leads={items} visibleColumns={visible} />
      </Card>
    </div>
  );
}
