'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Suspense, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  api,
  CampaignReport,
  LeadSourcesReport,
  PipelineReport,
  ActivityVolumeReport,
  FollowupHealthReport,
  TaskPriority,
  TaskStatus,
} from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { stageClass, stageLabel } from '@/lib/stages';
import { contextLabel } from '@/lib/tasks';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Inbox,
  TrendingUp,
} from 'lucide-react';

const TABS = [
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'sources', label: 'Lead sources' },
  { id: 'activity', label: 'Activity volume' },
  { id: 'followup', label: 'Follow-up health' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const DAY_OPTIONS = [7, 30, 90] as const;
type DayOption = (typeof DAY_OPTIONS)[number];

const REPORT_STALE_TIME = 5 * 60 * 1000;

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-[1280px] mx-auto px-6 py-8 text-ink-muted">
          Loading…
        </div>
      }
    >
      <Body />
    </Suspense>
  );
}

function Body() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const tab = (sp.get('tab') as TabId) || 'pipeline';
  const safeTab: TabId = TABS.some((t) => t.id === tab) ? tab : 'pipeline';
  const daysRaw = Number(sp.get('days') ?? 30);
  const days: DayOption = DAY_OPTIONS.includes(daysRaw as DayOption)
    ? (daysRaw as DayOption)
    : 30;

  const setParam = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === '') p.delete(k);
      else p.set(k, v);
    }
    router.replace(p.toString() ? `${pathname}?${p.toString()}` : pathname);
  };

  const rangeLabel = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) =>
      d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
    return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`;
  }, [days]);

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-6 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-caption text-ink-muted">{rangeLabel}</div>
        <div className="flex items-center gap-1 border border-border rounded-md bg-surface overflow-hidden">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setParam({ days: String(d) })}
              className={clsx(
                'px-3 h-9 text-bodysm transition-colors',
                d === days
                  ? 'bg-primary text-white font-medium'
                  : 'text-ink-muted hover:bg-background',
              )}
            >
              {d} days
            </button>
          ))}
        </div>
      </header>

      <nav className="flex border-b border-border -mx-1 overflow-x-auto scroll-thin">
        {TABS.map((t) => {
          const active = t.id === safeTab;
          return (
            <button
              key={t.id}
              onClick={() => setParam({ tab: t.id })}
              className={clsx(
                'mx-1 px-4 h-10 text-bodysm font-medium border-b-2 -mb-px whitespace-nowrap',
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-ink-muted hover:text-ink',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {safeTab === 'pipeline' && <PipelineTab />}
      {safeTab === 'campaigns' && <CampaignsTab days={days} />}
      {safeTab === 'sources' && <SourcesTab days={days} />}
      {safeTab === 'activity' && <ActivityTab days={days} />}
      {safeTab === 'followup' && <FollowupTab />}
    </div>
  );
}

// ─── Pipeline tab ────────────────────────────────────────────────────────

function PipelineTab() {
  const q = useQuery({
    queryKey: ['report-pipeline'],
    queryFn: api.getPipelineReport,
    staleTime: REPORT_STALE_TIME,
  });
  const data = q.data;
  if (!data) return <Loading />;

  const max = Math.max(1, ...data.byStage.map((r) => r.count));

  return (
    <div className="space-y-5">
      <Card className="!p-4">
        <SectionHeader
          icon={<TrendingUp size={14} />}
          title="Stage funnel"
          right={
            <span className="text-caption text-ink-muted">
              {data.total.toLocaleString()} leads
            </span>
          }
        />
        {data.total === 0 ? (
          <Empty>No leads yet — kick off a scrape.</Empty>
        ) : (
          <ul className="space-y-2">
            {data.byStage.map((r) => (
              <li key={r.stage}>
                <div className="flex items-center gap-2 mb-0.5 text-bodysm">
                  <span className="text-ink truncate flex-1">
                    {stageLabel(r.stage)}
                  </span>
                  <span className="font-mono font-tabular text-ink-muted shrink-0">
                    {r.count.toLocaleString()} ·{' '}
                    {(r.percentOfTotal * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-3 rounded-full bg-background overflow-hidden">
                  <div
                    className={clsx(
                      'h-full rounded-full transition-all',
                      stageClass(r.stage),
                    )}
                    style={{
                      width: `${(r.count / max) * 100}%`,
                      minWidth: r.count > 0 ? 4 : 0,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="!p-4">
        <SectionHeader title="Stage-to-stage conversion" />
        {data.total === 0 ? (
          <Empty>No data yet.</Empty>
        ) : (
          <table className="w-full text-bodysm">
            <thead className="text-caption uppercase tracking-wider text-neutral text-left">
              <tr>
                <Th>From</Th>
                <Th>To</Th>
                <Th align="right">From count</Th>
                <Th align="right">To count</Th>
                <Th align="right">Rate</Th>
              </tr>
            </thead>
            <tbody>
              {data.conversionRates.map((r) => (
                <tr key={`${r.fromStage}-${r.toStage}`} className="border-t border-border">
                  <Td>{stageLabel(r.fromStage)}</Td>
                  <Td>{stageLabel(r.toStage)}</Td>
                  <Td align="right" mono>
                    {r.fromCount.toLocaleString()}
                  </Td>
                  <Td align="right" mono>
                    {r.toCount.toLocaleString()}
                  </Td>
                  <Td align="right" mono>
                    {(r.rate * 100).toFixed(1)}%
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="!p-4">
        <SectionHeader title="Outcomes" />
        <div className="grid grid-cols-3 gap-3">
          <OutcomeCard
            label="Converted"
            value={data.outcomes.converted}
            total={data.total}
            tone="text-success"
          />
          <OutcomeCard
            label="Not converted"
            value={data.outcomes.notConverted}
            total={data.total}
            tone="text-warning"
          />
          <OutcomeCard
            label="Lost"
            value={data.outcomes.lost}
            total={data.total}
            tone="text-error"
          />
        </div>
      </Card>
    </div>
  );
}

function OutcomeCard({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <Card className="!p-3">
      <div className="text-caption text-neutral">{label}</div>
      <div className={clsx('text-h2 font-mono font-tabular mt-1', tone)}>
        {value.toLocaleString()}
      </div>
      <div className="text-caption text-ink-muted mt-0.5 font-mono font-tabular">
        {pct.toFixed(1)}% of total
      </div>
    </Card>
  );
}

// ─── Campaigns tab ───────────────────────────────────────────────────────

function CampaignsTab({ days }: { days: number }) {
  const q = useQuery({
    queryKey: ['report-campaigns', days],
    queryFn: () => api.getCampaignReport({ days }),
    staleTime: REPORT_STALE_TIME,
  });
  const data = q.data;
  if (!data) return <Loading />;

  const t = data.totals;
  const maxSent = Math.max(1, ...data.perDay.map((d) => d.emailsSent));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Started" value={t.campaignsStarted} />
        <Stat label="Recipients" value={t.totalRecipients} />
        <Stat label="Sent" value={t.totalSent} />
        <Stat label="Opens" value={t.totalOpens} />
        <Stat label="Replies" value={t.totalReplies} />
        <Stat label="Avg open rate" value={`${(t.averageOpenRate * 100).toFixed(1)}%`} />
      </div>

      <Card className="!p-4">
        <SectionHeader title={`Emails sent · last ${days} days`} />
        {t.totalSent === 0 ? (
          <Empty>No emails sent in this range.</Empty>
        ) : (
          <BarRow data={data.perDay.map((d) => ({ key: d.date, value: d.emailsSent }))} max={maxSent} />
        )}
      </Card>

      <Card className="!p-4 overflow-x-auto">
        <SectionHeader
          title={`Campaigns (${data.campaigns.length})`}
          right={
            data.campaigns.length === 0 && (
              <span className="text-caption text-ink-muted">
                No campaigns in the last {days} days
              </span>
            )
          }
        />
        {data.campaigns.length > 0 && (
          <table className="w-full text-bodysm min-w-[900px]">
            <thead className="text-caption uppercase tracking-wider text-neutral text-left">
              <tr>
                <Th>Name</Th>
                <Th>Status</Th>
                <Th>Started</Th>
                <Th align="right">Recipients</Th>
                <Th align="right">Sent</Th>
                <Th align="right">Opens</Th>
                <Th align="right">Open rate</Th>
                <Th align="right">Replies</Th>
                <Th align="right">Reply rate</Th>
              </tr>
            </thead>
            <tbody>
              {data.campaigns.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-background/50">
                  <Td>
                    <Link
                      href={`/campaigns/${c.id}`}
                      className="text-primary hover:underline"
                    >
                      {c.name}
                    </Link>
                  </Td>
                  <Td>
                    <span className="inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium border bg-background text-ink-muted">
                      {c.status}
                    </span>
                  </Td>
                  <Td>{c.startedAt ? new Date(c.startedAt).toLocaleDateString() : '—'}</Td>
                  <Td align="right" mono>
                    {c.recipientCount.toLocaleString()}
                  </Td>
                  <Td align="right" mono>
                    {c.sentCount.toLocaleString()}
                  </Td>
                  <Td align="right" mono>
                    {c.openedCount.toLocaleString()}
                  </Td>
                  <Td align="right" mono>
                    {(c.openRate * 100).toFixed(1)}%
                  </Td>
                  <Td align="right" mono>
                    {c.repliedCount.toLocaleString()}
                  </Td>
                  <Td align="right" mono>
                    {(c.replyRate * 100).toFixed(1)}%
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function BarRow({
  data,
  max,
  height = 60,
}: {
  data: { key: string; value: number }[];
  max: number;
  height?: number;
}) {
  return (
    <div>
      <div className="flex items-end gap-0.5" style={{ height }}>
        {data.map((d) => {
          const h = (d.value / max) * height;
          return (
            <div
              key={d.key}
              className="flex-1 bg-primary/30 hover:bg-primary/60 transition-colors min-h-[2px] rounded-sm relative group"
              style={{ height: Math.max(2, h) }}
              title={`${d.key}: ${d.value}`}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-1 text-caption text-ink-muted font-mono font-tabular">
        <span>{data[0]?.key.slice(5) ?? ''}</span>
        <span>{data[data.length - 1]?.key.slice(5) ?? ''}</span>
      </div>
    </div>
  );
}

// ─── Lead sources tab ────────────────────────────────────────────────────

function SourcesTab({ days }: { days: number }) {
  const q = useQuery({
    queryKey: ['report-sources', days],
    queryFn: () => api.getLeadSourcesReport({ days }),
    staleTime: REPORT_STALE_TIME,
  });
  const data = q.data;
  if (!data) return <Loading />;
  const empty =
    data.bySource.length === 0 && data.byCategory.length === 0;

  return (
    <div className="space-y-5">
      <Card className="!p-4 overflow-x-auto">
        <SectionHeader title="By source" />
        {empty ? (
          <Empty>No leads added in this range.</Empty>
        ) : (
          <SourceTable
            rows={data.bySource.map((r) => ({
              label: r.source,
              ...r,
            }))}
            labelHeader="Source"
          />
        )}
      </Card>

      <Card className="!p-4 overflow-x-auto">
        <SectionHeader title="By category (top 20)" />
        {data.byCategory.length === 0 ? (
          <Empty>No categories with leads in this range.</Empty>
        ) : (
          <SourceTable
            rows={data.byCategory.map((r) => ({
              label: r.category,
              ...r,
            }))}
            labelHeader="Category"
          />
        )}
      </Card>
    </div>
  );
}

function SourceTable({
  rows,
  labelHeader,
}: {
  rows: {
    label: string;
    leadCount: number;
    qualifiedCount: number;
    convertedCount: number;
    qualifiedRate: number;
    convertedRate: number;
  }[];
  labelHeader: string;
}) {
  return (
    <table className="w-full text-bodysm min-w-[700px]">
      <thead className="text-caption uppercase tracking-wider text-neutral text-left">
        <tr>
          <Th>{labelHeader}</Th>
          <Th align="right">Leads</Th>
          <Th align="right">Qualified</Th>
          <Th align="right">Qualified rate</Th>
          <Th align="right">Converted</Th>
          <Th align="right">Converted rate</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-t border-border hover:bg-background/50">
            <Td>{r.label || '(uncategorized)'}</Td>
            <Td align="right" mono>
              {r.leadCount.toLocaleString()}
            </Td>
            <Td align="right" mono>
              {r.qualifiedCount.toLocaleString()}
            </Td>
            <Td align="right" mono>
              {(r.qualifiedRate * 100).toFixed(1)}%
            </Td>
            <Td align="right" mono>
              {r.convertedCount.toLocaleString()}
            </Td>
            <Td align="right" mono>
              {(r.convertedRate * 100).toFixed(1)}%
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Activity volume tab ─────────────────────────────────────────────────

function ActivityTab({ days }: { days: number }) {
  const q = useQuery({
    queryKey: ['report-activity', days],
    queryFn: () => api.getActivityVolumeReport({ days }),
    staleTime: REPORT_STALE_TIME,
  });
  const data = q.data;
  if (!data) return <Loading />;
  const t = data.totals;
  const metrics: { key: keyof ActivityVolumeReport['perDay'][number]; label: string }[] = [
    { key: 'leadsAdded', label: 'Leads added' },
    { key: 'emailsSent', label: 'Emails sent' },
    { key: 'emailsOpened', label: 'Opens' },
    { key: 'emailsReplied', label: 'Replies' },
    { key: 'callsLogged', label: 'Calls' },
    { key: 'meetingsHeld', label: 'Meetings' },
    { key: 'proposalsSent', label: 'Proposals' },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Stat label="Leads added" value={t.leadsAdded} />
        <Stat label="Emails sent" value={t.emailsSent} />
        <Stat label="Opens" value={t.emailsOpened} />
        <Stat label="Replies" value={t.emailsReplied} />
        <Stat label="Calls" value={t.callsLogged} />
        <Stat label="Meetings" value={t.meetingsHeld} />
        <Stat label="Proposals" value={t.proposalsSent} />
      </div>

      <Card className="!p-4 space-y-5">
        <SectionHeader title={`Per-day breakdown · last ${days} days`} />
        {metrics.map((m) => {
          const series = data.perDay.map((d) => ({
            key: d.date,
            value: d[m.key] as number,
          }));
          const max = Math.max(1, ...series.map((s) => s.value));
          return (
            <div key={m.key as string}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-caption uppercase tracking-wider text-neutral">
                  {m.label}
                </span>
                <span className="text-caption text-ink-muted font-mono font-tabular">
                  total {(t as any)[m.key].toLocaleString()}
                </span>
              </div>
              <BarRow data={series} max={max} height={40} />
            </div>
          );
        })}
      </Card>
    </div>
  );
}

// ─── Follow-up health tab ────────────────────────────────────────────────

const STATUS_LABEL: Record<TaskStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  done: 'Done',
  cancelled: 'Cancelled',
};
const STATUS_TONE: Record<TaskStatus, string> = {
  open: 'bg-blue-500',
  in_progress: 'bg-amber-500',
  done: 'bg-success',
  cancelled: 'bg-zinc-400',
};
const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

function FollowupTab() {
  const q = useQuery({
    queryKey: ['report-followup'],
    queryFn: api.getFollowupHealthReport,
    staleTime: REPORT_STALE_TIME,
  });
  const data = q.data;
  if (!data) return <Loading />;

  const totalStatus = data.byStatus.reduce((s, r) => s + r.count, 0);

  return (
    <div className="space-y-5">
      {data.staleOpenCount > 10 && (
        <div className="rounded-md border border-warning/40 bg-[#FEF4E5] p-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
          <div className="text-bodysm text-ink">
            <strong>Stale follow-ups</strong> ·{' '}
            <span className="font-mono font-tabular">
              {data.staleOpenCount}
            </span>{' '}
            open follow-up tasks are older than 14 days. Consider closing or
            re-prioritizing them.
          </div>
        </div>
      )}

      <Card className="!p-4">
        <SectionHeader title="By status" />
        {totalStatus === 0 ? (
          <Empty>No follow-up tasks yet.</Empty>
        ) : (
          <ul className="space-y-2">
            {data.byStatus.map((r) => {
              const pct = totalStatus > 0 ? (r.count / totalStatus) * 100 : 0;
              return (
                <li key={r.status}>
                  <div className="flex items-center gap-2 mb-0.5 text-bodysm">
                    <span className="text-ink truncate flex-1">
                      {STATUS_LABEL[r.status]}
                    </span>
                    <span className="font-mono font-tabular text-ink-muted shrink-0">
                      {r.count.toLocaleString()} · {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-background overflow-hidden">
                    <div
                      className={clsx('h-full rounded-full', STATUS_TONE[r.status])}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="!p-4">
        <SectionHeader
          icon={<Inbox size={14} />}
          title="By bucket"
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {data.byBucket.map((b) => (
            <Stat
              key={b.bucket}
              label={
                b.bucket === 'today'
                  ? 'Today'
                  : b.bucket === 'overdue'
                  ? 'Overdue'
                  : b.bucket === 'upcoming'
                  ? 'Upcoming'
                  : 'Completed'
              }
              value={b.count}
              tone={b.bucket === 'overdue' && b.count > 0 ? 'warning' : undefined}
            />
          ))}
        </div>
      </Card>

      <Card className="!p-4 overflow-x-auto">
        <SectionHeader title="By context (open follow-ups)" />
        {data.byContext.length === 0 ? (
          <Empty>No open follow-up contexts.</Empty>
        ) : (
          <table className="w-full text-bodysm">
            <thead className="text-caption uppercase tracking-wider text-neutral text-left">
              <tr>
                <Th>Context</Th>
                <Th align="right">Open count</Th>
              </tr>
            </thead>
            <tbody>
              {data.byContext.map((r) => (
                <tr key={r.context} className="border-t border-border">
                  <Td>
                    <Link
                      href={`/tasks?context=${r.context}`}
                      className="text-primary hover:underline"
                    >
                      {contextLabel(r.context)}
                    </Link>
                  </Td>
                  <Td align="right" mono>
                    {r.count.toLocaleString()}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="!p-4">
        <SectionHeader title="By priority (open follow-ups)" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {data.byPriority.map((r) => (
            <Stat key={r.priority} label={PRIORITY_LABEL[r.priority]} value={r.count} />
          ))}
        </div>
      </Card>

      <Card className="!p-4">
        <SectionHeader
          icon={<Clock size={14} />}
          title="Health metrics"
        />
        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="Avg completion days"
            value={
              data.averageCompletionDays === null
                ? '—'
                : data.averageCompletionDays.toFixed(1)
            }
          />
          <Stat
            label="Stale open (>14d)"
            value={data.staleOpenCount}
            tone={data.staleOpenCount > 10 ? 'warning' : undefined}
          />
        </div>
      </Card>
    </div>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────────

function Loading() {
  return (
    <div className="text-bodysm text-ink-muted py-8">Loading…</div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-bodysm text-ink-muted py-3">{children}</div>;
}

function SectionHeader({
  icon,
  title,
  right,
}: {
  icon?: React.ReactNode;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <div className="text-caption uppercase tracking-wider text-neutral inline-flex items-center gap-1.5">
        {icon}
        {title}
      </div>
      {right}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: 'warning';
}) {
  return (
    <Card
      className={clsx(
        '!p-3',
        tone === 'warning' && 'border-warning/40 bg-[#FEF4E5]',
      )}
    >
      <div className="text-caption text-neutral">{label}</div>
      <div className="text-h2 font-mono font-tabular mt-1">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </Card>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className={clsx(
        'px-3 py-2 font-medium whitespace-nowrap',
        align === 'right' && 'text-right',
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  mono,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  mono?: boolean;
}) {
  return (
    <td
      className={clsx(
        'px-3 py-2 align-middle whitespace-nowrap',
        align === 'right' && 'text-right',
        mono && 'font-mono font-tabular',
      )}
    >
      {children}
    </td>
  );
}
