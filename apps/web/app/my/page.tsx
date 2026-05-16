'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/components/AuthContext';
import { myTasksApi, type MyTask } from '@/lib/my-tasks';

export default function MyDashboardPage() {
  const { ctx, can } = useAuth();
  const qc = useQueryClient();
  const feed = useQuery({ queryKey: ['my-tasks'], queryFn: myTasksApi.feed });

  const complete = useMutation({
    mutationFn: (id: string) => myTasksApi.complete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-tasks'] }),
  });

  if (!ctx) return <div className="p-6 text-ink-muted">Sign in required.</div>;
  if (!can('crm.task.read.assigned') && !can('crm.task.read')) {
    return <div className="p-6 text-ink-muted">You don't have access to tasks.</div>;
  }

  const canComplete = can('crm.task.complete.own') || can('crm.task.complete.any');

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">My work</h1>
        <p className="text-sm text-ink-muted mt-1">
          Tasks assigned to <b>{ctx.user.name}</b> · {feed.data?.total ?? 0} total
        </p>
      </div>

      {feed.isLoading && <div className="text-ink-muted">Loading…</div>}
      {feed.error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {(feed.error as Error).message}
        </div>
      )}

      {feed.data && (
        <div className="space-y-6">
          <Section title="Overdue" tone="danger" tasks={feed.data.overdue} canComplete={canComplete} onComplete={complete.mutate} />
          <Section title="Due today" tone="warn" tasks={feed.data.today} canComplete={canComplete} onComplete={complete.mutate} />
          <Section title="Upcoming / open" tone="info" tasks={feed.data.open} canComplete={canComplete} onComplete={complete.mutate} />
          <Section title="Recently completed" tone="muted" tasks={feed.data.done.slice(0, 10)} canComplete={false} onComplete={() => {}} />
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  tone,
  tasks,
  canComplete,
  onComplete,
}: {
  title: string;
  tone: 'danger' | 'warn' | 'info' | 'muted';
  tasks: MyTask[];
  canComplete: boolean;
  onComplete: (id: string) => void;
}) {
  const dotClass =
    tone === 'danger' ? 'bg-red-400' :
    tone === 'warn'   ? 'bg-amber-400' :
    tone === 'info'   ? 'bg-emerald-400' : 'bg-zinc-500';

  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2">
        <span className={`h-2 w-2 rounded-full ${dotClass}`} />
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <span className="text-xs text-ink-muted">{tasks.length}</span>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-3 text-xs text-ink-muted">
          Nothing here.
        </div>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li key={t.id} className="rounded-xl border border-border bg-surface p-4 hover:border-border-strong transition">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <PriorityChip priority={t.priority} />
                    {t.status !== 'open' && <StatusChip status={t.status} />}
                    <h3 className="font-medium text-ink truncate">{t.title}</h3>
                  </div>
                  {t.description && (
                    <p className="mt-1 text-sm text-ink-muted line-clamp-2">{t.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                    {t.lead && (
                      <Link
                        href={`/leads/${t.lead.id}`}
                        className="hover:text-ink"
                      >
                        🏢 {t.lead.businessName}
                      </Link>
                    )}
                    {t.dueAt && (
                      <span>📅 Due {new Date(t.dueAt).toLocaleString()}</span>
                    )}
                    {t.createdBy?.user && (
                      <span>👤 Created by {t.createdBy.user.name}</span>
                    )}
                  </div>
                </div>

                {canComplete && t.status !== 'done' && (
                  <button
                    onClick={() => onComplete(t.id)}
                    className="shrink-0 rounded-md bg-emerald-500/90 hover:bg-emerald-500 text-emerald-950 text-xs font-medium px-3 py-1.5 transition"
                  >
                    Mark done
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PriorityChip({ priority }: { priority: MyTask['priority'] }) {
  const cls = {
    low:    'bg-zinc-500/15 text-zinc-300',
    medium: 'bg-sky-500/15 text-sky-300',
    high:   'bg-orange-500/15 text-orange-300',
    urgent: 'bg-red-500/15 text-red-300',
  }[priority];
  return (
    <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${cls}`}>
      {priority}
    </span>
  );
}

function StatusChip({ status }: { status: MyTask['status'] }) {
  const cls = {
    open:        'bg-zinc-500/15 text-zinc-300',
    in_progress: 'bg-amber-500/15 text-amber-300',
    done:        'bg-emerald-500/15 text-emerald-300',
    cancelled:   'bg-red-500/15 text-red-300',
  }[status];
  return (
    <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${cls}`}>
      {status.replace('_', ' ')}
    </span>
  );
}
