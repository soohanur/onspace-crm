'use client';

export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Chip } from '@/components/ui/Chip';
import { Reply, Send } from 'lucide-react';

const PAGE_SIZE = 50;

export default function EmailActivityPage() {
  const sp = useSearchParams();
  const initialFilter = sp.get('filter') === 'replied';
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [replied, setReplied] = useState(initialFilter);
  const [page, setPage] = useState(0);

  const daily = useQuery({
    queryKey: ['email-activity-daily', 14],
    queryFn: () => api.getEmailActivityDaily(14),
    refetchInterval: 30_000,
  });

  const list = useQuery({
    queryKey: ['email-activity', { from, to, q, replied, page }],
    queryFn: () =>
      api.getEmailActivity({
        from: from || undefined,
        to: to || undefined,
        q: q || undefined,
        replied,
        take: PAGE_SIZE,
        skip: page * PAGE_SIZE,
      }),
    refetchInterval: 30_000,
  });

  const totalSent = useMemo(
    () => daily.data?.buckets.reduce((acc, b) => acc + b.sent, 0) ?? 0,
    [daily.data],
  );
  const totalReplies = useMemo(
    () => daily.data?.buckets.reduce((acc, b) => acc + b.replies, 0) ?? 0,
    [daily.data],
  );
  const replyRatio = totalSent > 0
    ? Math.round((totalReplies / totalSent) * 100)
    : 0;

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-6 space-y-4">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-h1">Email activity</h1>
          <div className="text-bodysm text-ink-muted mt-1">
            All outbound sends across every lead. Last 14 days:{' '}
            <strong>{totalSent.toLocaleString()}</strong> sent,{' '}
            <strong>{totalReplies.toLocaleString()}</strong> replies (
            <strong>{replyRatio}%</strong> reply rate).
          </div>
        </div>
      </header>

      <DailyChart
        buckets={daily.data?.buckets ?? []}
        loading={daily.isLoading}
      />

      <Card className="!p-3">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
          <div>
            <label className="block text-caption uppercase tracking-wider text-neutral mb-1.5">
              From
            </label>
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <div>
            <label className="block text-caption uppercase tracking-wider text-neutral mb-1.5">
              To
            </label>
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <div>
            <label className="block text-caption uppercase tracking-wider text-neutral mb-1.5">
              Search
            </label>
            <Input
              placeholder="business, subject, email…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <label className="inline-flex items-center gap-2 text-bodysm cursor-pointer select-none h-10">
            <input
              type="checkbox"
              checked={replied}
              onChange={(e) => {
                setReplied(e.target.checked);
                setPage(0);
              }}
              className="size-4 accent-primary"
            />
            Replied only
          </label>
        </div>
      </Card>

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-bodysm">
            <thead className="bg-background text-caption text-neutral uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2 w-44">Sent</th>
                <th className="text-left px-4 py-2">Lead</th>
                <th className="text-left px-4 py-2">Subject</th>
                <th className="text-left px-4 py-2 w-56">To</th>
                <th className="text-center px-4 py-2 w-24">Replied</th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!list.isLoading && list.data?.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink-muted">
                    No emails match this filter.
                  </td>
                </tr>
              )}
              {list.data?.items.map((row) => (
                <tr key={row.id} className="border-t border-border hover:bg-background">
                  <td className="px-4 py-2 font-mono font-tabular text-ink-muted">
                    {row.sentAt
                      ? new Date(row.sentAt).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : '—'}
                  </td>
                  <td className="px-4 py-2">
                    {row.lead ? (
                      <Link
                        href={`/leads/${row.lead.id}`}
                        className="text-primary hover:underline"
                      >
                        {row.lead.businessName}
                      </Link>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                    {row.lead?.city && (
                      <span className="text-caption text-neutral ml-2">
                        {row.lead.city}
                        {row.lead.state ? `, ${row.lead.state}` : ''}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 truncate max-w-[480px]">{row.subject}</td>
                  <td className="px-4 py-2 text-ink-muted truncate max-w-[280px]">
                    {row.toEmail}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {row.repliedAt ? (
                      <Chip tone="positive" className="!h-5 !text-[11px]">
                        <Reply size={11} /> yes
                      </Chip>
                    ) : (
                      <span className="text-neutral">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.data && list.data.total > PAGE_SIZE && (
          <Pager
            page={page}
            total={list.data.total}
            pageSize={PAGE_SIZE}
            onPage={setPage}
          />
        )}
      </Card>
    </div>
  );
}

function DailyChart({
  buckets,
  loading,
}: {
  buckets: { date: string; sent: number; replies: number }[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <Card className="!p-4 h-44 grid place-items-center text-ink-muted">
        Loading chart…
      </Card>
    );
  }
  const max = Math.max(1, ...buckets.map((b) => b.sent));
  return (
    <Card className="!p-4">
      <div className="flex items-center gap-4 text-caption text-ink-muted mb-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-primary" />
          <Send size={12} /> sent
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-positive" />
          <Reply size={12} /> replied
        </span>
      </div>
      <div className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-1 h-28 items-end">
        {buckets.map((b) => {
          const sentH = Math.round((b.sent / max) * 100);
          const replyH = b.sent > 0
            ? Math.round((b.replies / b.sent) * sentH)
            : 0;
          return (
            <div key={b.date} className="flex flex-col items-center gap-1 group">
              <div
                className="w-full bg-primary/30 rounded-sm relative"
                style={{ height: `${sentH}%`, minHeight: b.sent > 0 ? '4px' : '2px' }}
                title={`${b.date}: ${b.sent} sent, ${b.replies} replied`}
              >
                <div
                  className="absolute inset-x-0 bottom-0 bg-positive rounded-sm"
                  style={{ height: `${replyH}%` }}
                />
              </div>
              <div className="text-[10px] text-neutral font-mono">
                {b.date.slice(5)}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Pager({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  const last = Math.max(0, Math.ceil(total / pageSize) - 1);
  return (
    <div className="border-t border-border px-4 py-2 flex items-center justify-between text-caption text-ink-muted">
      <div>
        {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of{' '}
        {total.toLocaleString()}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPage(Math.max(0, page - 1))}
          disabled={page === 0}
          className={clsx(
            'px-2 py-1 rounded border border-border',
            page === 0
              ? 'text-neutral cursor-not-allowed'
              : 'text-ink hover:bg-background',
          )}
        >
          Prev
        </button>
        <button
          type="button"
          onClick={() => onPage(Math.min(last, page + 1))}
          disabled={page >= last}
          className={clsx(
            'px-2 py-1 rounded border border-border',
            page >= last
              ? 'text-neutral cursor-not-allowed'
              : 'text-ink hover:bg-background',
          )}
        >
          Next
        </button>
      </div>
    </div>
  );
}
