'use client';

// useSearchParams() requires Suspense + dynamic for Next.js 15 prerender.
export const dynamic = 'force-dynamic';

import { Suspense, useMemo, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import clsx from 'clsx';
import Link from 'next/link';
import { api, Task, TaskBucket, TaskContext, TaskPriority } from '@/lib/api';
import {
  TASK_BUCKETS,
  TASK_CONTEXTS,
  TASK_PRIORITIES,
  bucketLabel,
  contextLabel,
  defaultContextForStage,
  dueLabel,
  priorityClass,
  priorityLabel,
} from '@/lib/tasks';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StageBadge } from '@/components/leads/StageBadge';
import { TaskFormModal } from '@/components/tasks/TaskFormModal';
import { LeadTypeahead } from '@/components/tasks/LeadTypeahead';
import {
  Check,
  ChevronDown,
  Plus,
  Trash2,
  Pencil,
} from 'lucide-react';

const TONE_CLASSES: Record<
  ReturnType<typeof dueLabel>['tone'],
  string
> = {
  overdue: 'text-error',
  today: 'text-warning',
  future: 'text-ink',
  none: 'text-neutral',
  done: 'text-success',
};

export default function TasksPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-[1400px] mx-auto px-6 py-8 text-ink-muted">
          Loading…
        </div>
      }
    >
      <TasksPageBody />
    </Suspense>
  );
}

function TasksPageBody() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const qc = useQueryClient();

  const bucket: TaskBucket =
    (sp.get('bucket') as TaskBucket) && TASK_BUCKETS.includes(sp.get('bucket') as TaskBucket)
      ? (sp.get('bucket') as TaskBucket)
      : 'today';
  const priorityCsv = sp.get('priority') ?? '';
  const priorities = priorityCsv
    .split(',')
    .filter((p): p is TaskPriority =>
      TASK_PRIORITIES.includes(p as TaskPriority),
    );
  const context = (sp.get('context') as TaskContext) || undefined;
  const leadId = sp.get('lead') ?? undefined;

  const updateUrl = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, v);
    }
    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  };

  const queryParams = useMemo(
    () => ({
      bucket,
      priority: priorities.length ? priorities.join(',') : undefined,
      context,
      leadId,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bucket, priorityCsv, context, leadId],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['tasks-list', queryParams],
    queryFn: () => api.listTasks(queryParams as any),
    refetchInterval: 30_000,
  });

  // Counts per tab (shared filters apply, but bucket overrides).
  const baseCountParams = {
    priority: priorities.length ? priorities.join(',') : undefined,
    context,
    leadId,
  };
  const today = useTabCount({ ...baseCountParams, bucket: 'today' });
  const overdue = useTabCount({ ...baseCountParams, bucket: 'overdue' });
  const upcoming = useTabCount({ ...baseCountParams, bucket: 'upcoming' });
  const completed = useTabCount({ ...baseCountParams, bucket: 'completed' });

  const [modalOpen, setModalOpen] = useState<
    null | { mode: 'create' } | { mode: 'edit'; task: Task }
  >(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['tasks-list'] });
    qc.invalidateQueries({ queryKey: ['tasks-count'] });
    if (leadId) qc.invalidateQueries({ queryKey: ['lead-tasks', leadId] });
  };

  const create = useMutation({
    mutationFn: api.createTask,
    onSuccess: () => {
      setModalOpen(null);
      invalidate();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: any }) =>
      api.updateTask(id, patch),
    onSuccess: () => {
      setModalOpen(null);
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: api.deleteTask,
    onSuccess: invalidate,
  });

  const items = data?.items ?? [];

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6">
      <div className="flex items-center justify-end mb-4">
        <Button onClick={() => setModalOpen({ mode: 'create' })}>
          <Plus size={14} /> New task
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border mb-4 -mx-1 overflow-x-auto scroll-thin">
        {TASK_BUCKETS.map((b) => {
          const count =
            b === 'today'
              ? today
              : b === 'overdue'
              ? overdue
              : b === 'upcoming'
              ? upcoming
              : completed;
          const active = b === bucket;
          return (
            <button
              key={b}
              onClick={() => updateUrl({ bucket: b })}
              className={clsx(
                'mx-1 px-4 h-10 text-bodysm font-medium border-b-2 -mb-px inline-flex items-center gap-2 whitespace-nowrap',
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-ink-muted hover:text-ink',
              )}
            >
              {bucketLabel(b)}
              <span
                className={clsx(
                  'inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded text-[11px] font-mono font-tabular',
                  active
                    ? 'bg-primary text-white'
                    : 'bg-background text-ink-muted',
                )}
              >
                {count ?? '—'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter row */}
      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_2fr] gap-3 mb-5">
        <PriorityChips
          value={priorities}
          onChange={(next) =>
            updateUrl({ priority: next.length ? next.join(',') : null })
          }
        />
        <ContextDropdown
          value={context}
          onChange={(c) => updateUrl({ context: c ?? null })}
        />
        <div>
          <div className="text-caption uppercase tracking-wider text-neutral mb-1">
            Lead
          </div>
          <LeadTypeahead
            value={leadId ?? null}
            onChange={(id) => updateUrl({ lead: id })}
            placeholder="Any lead"
          />
        </div>
      </div>

      <Card className="!p-0 overflow-hidden">
        {isLoading ? (
          <div className="px-5 py-8 text-bodysm text-ink-muted">Loading…</div>
        ) : items.length === 0 ? (
          <div className="px-5 py-12 text-center text-ink-muted text-bodysm">
            No {bucketLabel(bucket).toLowerCase()} tasks.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                onToggleDone={(done) =>
                  update.mutate({
                    id: t.id,
                    patch: { status: done ? 'done' : 'open' },
                  })
                }
                onEdit={() => setModalOpen({ mode: 'edit', task: t })}
                onDelete={() => {
                  if (confirm(`Delete task "${t.title}"?`)) remove.mutate(t.id);
                }}
              />
            ))}
          </ul>
        )}
      </Card>

      <TaskFormModal
        open={modalOpen !== null}
        initial={modalOpen?.mode === 'edit' ? modalOpen.task : undefined}
        pending={create.isPending || update.isPending}
        error={
          create.error
            ? (create.error as Error).message
            : update.error
            ? (update.error as Error).message
            : null
        }
        onClose={() => setModalOpen(null)}
        onSubmit={(input) => {
          if (modalOpen?.mode === 'edit') {
            update.mutate({ id: modalOpen.task.id, patch: input });
          } else {
            create.mutate(input);
          }
        }}
      />
    </div>
  );
}

function useTabCount(params: Record<string, any>) {
  const { data } = useQuery({
    queryKey: ['tasks-count', params],
    queryFn: () => api.listTasks({ ...params, take: 1 }),
    refetchInterval: 60_000,
  });
  // We need an actual count, so issue a count-style call: re-fetch with full take.
  // Cheaper: run another query with take=200 and use length. For MVP this is fine
  // (tabs are few, refetch infrequently).
  const { data: full } = useQuery({
    queryKey: ['tasks-count-full', params],
    queryFn: () => api.listTasks({ ...params, take: 200 }),
    refetchInterval: 60_000,
  });
  void data;
  return full?.items.length ?? 0;
}

function TaskRow({
  task,
  onToggleDone,
  onEdit,
  onDelete,
}: {
  task: Task;
  onToggleDone: (done: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const due = dueLabel(task.dueAt, task.status);
  const isDone = task.status === 'done';

  return (
    <li
      className={clsx(
        'group px-5 py-3.5 hover:bg-background transition-colors flex items-start gap-3',
        isDone && 'opacity-60',
      )}
    >
      <button
        onClick={() => onToggleDone(!isDone)}
        className={clsx(
          'mt-1 h-5 w-5 rounded-md border flex items-center justify-center shrink-0 transition-colors',
          isDone
            ? 'bg-success border-success text-white'
            : 'border-border bg-surface hover:border-primary',
        )}
        aria-label={isDone ? 'Mark not done' : 'Mark done'}
      >
        {isDone && <Check size={12} />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onEdit}
            className={clsx(
              'text-bodysm font-medium text-left hover:text-primary truncate',
              isDone && 'line-through',
            )}
          >
            {task.title}
          </button>
          <span
            className={clsx(
              'inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium border whitespace-nowrap',
              priorityClass(task.priority),
            )}
          >
            {priorityLabel(task.priority)}
          </span>
          {task.context !== 'none' && (
            <span className="text-caption text-neutral whitespace-nowrap">
              {contextLabel(task.context)}
            </span>
          )}
        </div>
        {task.description && (
          <div className="text-caption text-ink-muted whitespace-pre-line mt-1 line-clamp-2">
            {task.description}
          </div>
        )}
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          {task.lead && (
            <Link
              href={`/leads/${task.lead.id}`}
              className="inline-flex items-center gap-1.5 text-caption text-primary hover:underline truncate max-w-[260px]"
            >
              {task.lead.businessName}
            </Link>
          )}
          {task.lead && <StageBadge stage={task.lead.stage} />}
          <span className={clsx('text-caption', TONE_CLASSES[due.tone])}>
            {due.label}
          </span>
        </div>
      </div>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0">
        <button
          onClick={onEdit}
          className="p-1 rounded-md text-neutral hover:text-ink hover:bg-background"
          aria-label="Edit task"
          title="Edit"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={onDelete}
          className="p-1 rounded-md text-neutral hover:text-error hover:bg-background"
          aria-label="Delete task"
          title="Delete"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </li>
  );
}

function PriorityChips({
  value,
  onChange,
}: {
  value: TaskPriority[];
  onChange: (next: TaskPriority[]) => void;
}) {
  const selected = new Set(value);
  return (
    <div>
      <div className="text-caption uppercase tracking-wider text-neutral mb-1">
        Priority
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TASK_PRIORITIES.map((p) => {
          const on = selected.has(p);
          return (
            <button
              key={p}
              onClick={() => {
                if (on) onChange(value.filter((v) => v !== p));
                else onChange([...value, p]);
              }}
              className={clsx(
                'inline-flex items-center h-7 px-2.5 rounded-md text-[12px] font-medium border transition-colors',
                priorityClass(p),
                on ? 'ring-2 ring-primary/40' : 'opacity-70 hover:opacity-100',
              )}
            >
              {priorityLabel(p)}
            </button>
          );
        })}
        {value.length > 0 && (
          <button
            onClick={() => onChange([])}
            className="text-caption text-ink-muted hover:text-error inline-flex items-center px-2 h-7"
          >
            clear
          </button>
        )}
      </div>
    </div>
  );
}

function ContextDropdown({
  value,
  onChange,
}: {
  value?: TaskContext;
  onChange: (v: TaskContext | undefined) => void;
}) {
  return (
    <div>
      <div className="text-caption uppercase tracking-wider text-neutral mb-1">
        Context
      </div>
      <div className="relative">
        <select
          value={value ?? ''}
          onChange={(e) =>
            onChange((e.target.value || undefined) as TaskContext | undefined)
          }
          className="h-10 w-full pl-3 pr-8 rounded-md border border-border bg-surface text-bodysm text-ink focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 appearance-none"
        >
          <option value="">Any context</option>
          {TASK_CONTEXTS.map((c) => (
            <option key={c} value={c}>
              {contextLabel(c)}
            </option>
          ))}
        </select>
        <ChevronDown
          size={12}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral pointer-events-none"
        />
      </div>
    </div>
  );
}
