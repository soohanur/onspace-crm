'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  api,
  CreateTaskInput,
  Lead,
  Task,
  UpdateTaskInput,
} from '@/lib/api';
import {
  contextLabel,
  defaultContextForStage,
  dueLabel,
  priorityClass,
  priorityLabel,
} from '@/lib/tasks';
import { Card } from '../ui/Card';
import { SectionHeader } from './LeadOverviewCard';
import { TaskFormModal } from '../tasks/TaskFormModal';
import {
  Check,
  CheckSquare,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';

const TONE_CLASSES = {
  overdue: 'text-error',
  today: 'text-warning',
  future: 'text-ink',
  none: 'text-neutral',
  done: 'text-success',
} as const;

/**
 * Lead detail tasks panel. Lists open + recent done tasks for one lead and
 * lets the user create either a follow-up (pre-filled context based on
 * the lead's current stage) or a generic task.
 */
export function LeadTasksPanel({ lead }: { lead: Lead }) {
  const qc = useQueryClient();
  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['lead-tasks', lead.id],
    queryFn: () => api.listLeadTasks(lead.id),
    initialData: lead.tasks,
  });

  const [modal, setModal] = useState<
    | null
    | { mode: 'create-followup' }
    | { mode: 'create-general' }
    | { mode: 'edit'; task: Task }
  >(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['lead-tasks', lead.id] });
    qc.invalidateQueries({ queryKey: ['lead', lead.id] });
    qc.invalidateQueries({ queryKey: ['tasks-list'] });
    qc.invalidateQueries({ queryKey: ['tasks-count-full'] });
  };

  const create = useMutation({
    mutationFn: (input: CreateTaskInput) => api.createTask(input),
    onSuccess: () => {
      setModal(null);
      invalidate();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTaskInput }) =>
      api.updateTask(id, patch),
    onSuccess: () => {
      setModal(null);
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteTask(id),
    onSuccess: invalidate,
  });

  // Sort: open/in_progress first (by due asc), then done (by completed desc).
  const sorted = [...tasks].sort((a, b) => {
    const aOpen = a.status !== 'done' && a.status !== 'cancelled';
    const bOpen = b.status !== 'done' && b.status !== 'cancelled';
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    if (aOpen) {
      const ad = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
      const bd = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
      return ad - bd;
    }
    const ac = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const bc = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    return bc - ac;
  });

  const openCount = sorted.filter(
    (t) => t.status === 'open' || t.status === 'in_progress',
  ).length;

  const initial = (() => {
    if (!modal) return undefined;
    if (modal.mode === 'edit') return modal.task;
    if (modal.mode === 'create-followup') {
      return {
        leadId: lead.id,
        kind: 'followup',
        context: defaultContextForStage(lead.stage),
        priority: 'medium',
      } as Partial<Task>;
    }
    return {
      leadId: lead.id,
      kind: 'general',
      context: 'none',
      priority: 'medium',
    } as Partial<Task>;
  })();

  return (
    <Card>
      <SectionHeader
        icon={<CheckSquare size={14} />}
        title={`Tasks (${openCount} open · ${sorted.length} total)`}
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setModal({ mode: 'create-followup' })}
              className="text-caption text-primary hover:underline inline-flex items-center gap-1"
            >
              <Plus size={12} /> Follow-up
            </button>
            <span className="text-neutral">·</span>
            <button
              onClick={() => setModal({ mode: 'create-general' })}
              className="text-caption text-primary hover:underline inline-flex items-center gap-1"
            >
              <Plus size={12} /> Task
            </button>
          </div>
        }
      />

      {sorted.length === 0 ? (
        <div className="text-bodysm text-ink-muted py-3">
          No tasks yet. Create a follow-up to track when to circle back.
        </div>
      ) : (
        <ul className="divide-y divide-border -mx-1">
          {sorted.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              onToggleDone={(done) =>
                update.mutate({
                  id: t.id,
                  patch: { status: done ? 'done' : 'open' },
                })
              }
              onEdit={() => setModal({ mode: 'edit', task: t })}
              onDelete={() => {
                if (confirm(`Delete task "${t.title}"?`)) remove.mutate(t.id);
              }}
            />
          ))}
        </ul>
      )}

      <TaskFormModal
        open={modal !== null}
        initial={initial}
        lockedLeadId={lead.id}
        pending={create.isPending || update.isPending}
        error={
          create.error
            ? (create.error as Error).message
            : update.error
            ? (update.error as Error).message
            : null
        }
        onClose={() => setModal(null)}
        onSubmit={(input) => {
          if (modal?.mode === 'edit') {
            update.mutate({ id: modal.task.id, patch: input });
          } else {
            create.mutate(input);
          }
        }}
      />
    </Card>
  );
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
        'group px-1 py-2.5 flex items-start gap-2',
        isDone && 'opacity-60',
      )}
    >
      <button
        onClick={() => onToggleDone(!isDone)}
        className={clsx(
          'mt-0.5 h-5 w-5 rounded-md border flex items-center justify-center shrink-0 transition-colors',
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
              'text-bodysm font-medium hover:text-primary text-left truncate',
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
          <div className="text-caption text-ink-muted whitespace-pre-line mt-0.5 line-clamp-2">
            {task.description}
          </div>
        )}
        <div className="mt-0.5 text-caption">
          <span className={TONE_CLASSES[due.tone]}>{due.label}</span>
        </div>
      </div>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0">
        <button
          onClick={onEdit}
          className="p-1 rounded-md text-neutral hover:text-ink hover:bg-background"
          aria-label="Edit task"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={onDelete}
          className="p-1 rounded-md text-neutral hover:text-error hover:bg-background"
          aria-label="Delete task"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </li>
  );
}
