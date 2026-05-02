'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Suspense, use, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  api,
  CampaignSummary,
  CampaignRecipient,
  CampaignRecipientStatus,
} from '@/lib/api';
import {
  campaignStatusClass,
  campaignStatusLabel,
  recipientStatusClass,
  recipientStatusLabel,
} from '@/lib/campaigns';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Pause,
  Play,
  Send,
  Square,
} from 'lucide-react';

const RECIPIENT_FILTERS: ('' | CampaignRecipientStatus)[] = [
  '',
  'pending',
  'sending',
  'sent',
  'failed',
  'skipped',
];

export default function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<div className="p-8 text-ink-muted">Loading…</div>}>
      <Body params={params} />
    </Suspense>
  );
}

function Body({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();

  const { data: c, isLoading } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => api.getCampaign(id),
    refetchInterval: (q) => {
      const data = q.state.data as CampaignSummary | undefined;
      return data && ['queued', 'running'].includes(data.status) ? 5_000 : 30_000;
    },
  });

  const start = useMutation({
    mutationFn: (accept: boolean) => api.startCampaign(id, accept),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', id] }),
    onError: (err: Error) => {
      if (err.message.includes('would be skipped')) {
        if (confirm(`${err.message}\n\nStart anyway?`)) {
          start.mutate(true);
        }
      } else {
        alert(err.message);
      }
    },
  });
  const pause = useMutation({
    mutationFn: () => api.pauseCampaign(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', id] }),
  });
  const resume = useMutation({
    mutationFn: () => api.resumeCampaign(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', id] }),
  });
  const cancel = useMutation({
    mutationFn: () => api.cancelCampaign(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', id] }),
  });

  if (isLoading || !c) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-8 text-ink-muted">
        Loading…
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-4">
        <Link
          href="/campaigns"
          className="text-caption text-ink-muted hover:text-primary inline-flex items-center gap-1"
        >
          <ArrowLeft size={12} /> Campaigns
        </Link>
      </div>

      <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="text-h1">{c.name}</h1>
            <span
              className={clsx(
                'inline-flex items-center h-6 px-2 rounded-md text-[12px] font-medium border',
                campaignStatusClass(c.status),
              )}
            >
              {campaignStatusLabel(c.status)}
            </span>
          </div>
          <div className="text-bodysm text-ink-muted flex flex-wrap gap-x-3">
            <span>Group: {c.group?.name}</span>
            <span>Template: {c.template?.name}</span>
            <span>Account: {c.account?.email}</span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {c.status === 'draft' && (
            <Button onClick={() => start.mutate(false)} disabled={start.isPending}>
              <Send size={14} /> Start
            </Button>
          )}
          {c.status === 'running' && (
            <Button variant="secondary" onClick={() => pause.mutate()}>
              <Pause size={14} /> Pause
            </Button>
          )}
          {c.status === 'paused' && (
            <Button onClick={() => resume.mutate()}>
              <Play size={14} /> Resume
            </Button>
          )}
          {['queued', 'running', 'paused'].includes(c.status) && (
            <Button
              variant="secondary"
              onClick={() => {
                if (confirm('Cancel campaign? Pending recipients will not be sent.')) {
                  cancel.mutate();
                }
              }}
              className="!text-error !border-error"
            >
              <Square size={14} /> Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard label="Recipients" value={c.recipientCount} />
        <StatCard label="Sent" value={c.sentCount} />
        <StatCard label="Failed" value={c.failedCount} tone="error" />
        <StatCard label="Skipped" value={c.skippedCount} tone="warning" />
        <StatCard label="Opened / Replied" value={`${c.openedCount} / ${c.repliedCount}`} />
      </div>

      {/* Progress bar */}
      <Card className="!p-4 mb-6">
        <div className="flex items-center justify-between text-bodysm mb-1.5">
          <span className="text-ink-muted">Progress</span>
          <span className="font-mono font-tabular text-ink">
            {c.sentCount} / {c.recipientCount}
          </span>
        </div>
        <div className="h-2 rounded-full bg-background overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{
              width: c.recipientCount
                ? `${Math.min(100, (c.sentCount / c.recipientCount) * 100)}%`
                : '0%',
            }}
          />
        </div>
      </Card>

      <RecipientsSection campaignId={id} />

      {/* Frozen template snapshot */}
      <details className="mt-6 rounded-md border border-border bg-surface">
        <summary className="px-4 h-12 flex items-center justify-between cursor-pointer">
          <span className="font-medium text-ink">Template snapshot</span>
          <ChevronRight size={14} className="text-neutral" />
        </summary>
        <div className="px-4 pb-4 text-bodysm">
          <p className="text-caption text-ink-muted mb-3">
            This is what the campaign is sending. Edits to the underlying
            template won't change in-flight sends.
          </p>
          <div className="text-caption text-neutral mb-1">Subject</div>
          <div className="font-medium text-ink mb-3 break-words">
            {c.frozenSubject ?? '—'}
          </div>
          <div className="text-caption text-neutral mb-1">Body</div>
          <pre className="whitespace-pre-wrap text-bodysm font-sans text-ink rounded-md bg-background p-3 border border-border">
            {c.frozenBodyText ?? '—'}
          </pre>
        </div>
      </details>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: 'error' | 'warning';
}) {
  return (
    <Card className="!p-3">
      <div className="text-caption uppercase tracking-wider text-neutral">{label}</div>
      <div
        className={clsx(
          'text-h2 font-mono font-tabular mt-1',
          tone === 'error' && 'text-error',
          tone === 'warning' && 'text-warning',
        )}
      >
        {value}
      </div>
    </Card>
  );
}

// ─── Recipients section ──────────────────────────────────────────────────

function RecipientsSection({ campaignId }: { campaignId: string }) {
  const [tab, setTab] = useState<'activity' | 'all'>('activity');
  const [statusFilter, setStatusFilter] = useState<'' | CampaignRecipientStatus>('');

  const { data: activity } = useQuery({
    queryKey: ['campaign-recipients', campaignId, 'activity'],
    queryFn: () => api.listCampaignRecipients(campaignId, { take: 20 }),
    refetchInterval: 5_000,
    enabled: tab === 'activity',
  });
  const { data: all } = useQuery({
    queryKey: ['campaign-recipients', campaignId, 'all', statusFilter],
    queryFn: () =>
      api.listCampaignRecipients(campaignId, {
        take: 200,
        status: statusFilter || undefined,
      }),
    enabled: tab === 'all',
  });

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="px-4 border-b border-border flex items-center gap-2">
        <button
          onClick={() => setTab('activity')}
          className={clsx(
            'h-10 px-2 text-bodysm font-medium border-b-2 -mb-px',
            tab === 'activity'
              ? 'border-primary text-primary'
              : 'border-transparent text-ink-muted hover:text-ink',
          )}
        >
          Activity
        </button>
        <button
          onClick={() => setTab('all')}
          className={clsx(
            'h-10 px-2 text-bodysm font-medium border-b-2 -mb-px',
            tab === 'all'
              ? 'border-primary text-primary'
              : 'border-transparent text-ink-muted hover:text-ink',
          )}
        >
          All recipients
        </button>
        {tab === 'all' && (
          <div className="ml-auto inline-flex gap-1.5">
            {RECIPIENT_FILTERS.map((s) => (
              <button
                key={s || 'all'}
                onClick={() => setStatusFilter(s)}
                className={clsx(
                  'px-2 h-7 rounded-md border text-caption font-medium',
                  statusFilter === s
                    ? 'bg-primary text-white border-primary'
                    : 'bg-surface text-ink-muted border-border hover:border-primary',
                )}
              >
                {s === '' ? 'All' : recipientStatusLabel(s)}
              </button>
            ))}
          </div>
        )}
      </div>
      <RecipientList items={(tab === 'activity' ? activity?.items : all?.items) ?? []} />
    </Card>
  );
}

function RecipientList({ items }: { items: CampaignRecipient[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (items.length === 0) {
    return (
      <div className="px-5 py-8 text-bodysm text-ink-muted text-center">
        No recipients matching this filter.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {items.map((r) => {
        const expanded = expandedId === r.id;
        return (
          <li key={r.id} className="hover:bg-background">
            <button
              onClick={() => setExpandedId(expanded ? null : r.id)}
              className="w-full text-left px-4 py-3 flex items-center gap-3"
            >
              <ChevronRight
                size={14}
                className={clsx(
                  'text-neutral shrink-0 transition-transform',
                  expanded && 'rotate-90',
                )}
              />
              <span
                className={clsx(
                  'inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium',
                  recipientStatusClass(r.status),
                )}
              >
                {recipientStatusLabel(r.status)}
              </span>
              <Link
                href={`/leads/${r.leadId}`}
                onClick={(e) => e.stopPropagation()}
                className="font-medium text-ink hover:text-primary truncate"
              >
                {r.lead?.businessName ?? r.toEmail}
              </Link>
              <span className="text-caption text-ink-muted truncate">{r.toEmail}</span>
              <span className="ml-auto text-caption text-neutral whitespace-nowrap">
                {r.attemptedAt ? new Date(r.attemptedAt).toLocaleString() : '—'}
              </span>
            </button>
            {expanded && (
              <div className="px-9 pb-3 text-bodysm text-ink-muted">
                <div className="text-caption text-neutral mb-1">Rendered subject</div>
                <div className="text-ink mb-2 break-words">{r.renderedSubject ?? '—'}</div>
                <div className="text-caption text-neutral mb-1">Rendered body</div>
                <pre className="whitespace-pre-wrap text-bodysm font-sans bg-background p-3 rounded-md border border-border">
                  {r.renderedBodyText ?? '—'}
                </pre>
                {r.error && (
                  <div className="mt-2 text-error text-caption">{r.error}</div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
