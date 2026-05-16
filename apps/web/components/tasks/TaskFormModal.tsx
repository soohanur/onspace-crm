'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  api,
  CreateTaskInput,
  Task,
  TaskContext,
  TaskKind,
  TaskPriority,
} from '@/lib/api';
import { membersApi } from '@/lib/members';
import { useAuth } from '@/components/AuthContext';
import {
  TASK_CONTEXTS,
  TASK_KINDS,
  TASK_PRIORITIES,
  contextLabel,
  priorityLabel,
} from '@/lib/tasks';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { LeadTypeahead } from './LeadTypeahead';
import { X } from 'lucide-react';

/**
 * Add or edit a task. Lead is locked when the modal is opened from a lead
 * detail page (lockedLeadId). When opened from /tasks, the user picks a
 * lead via typeahead.
 */
export function TaskFormModal({
  open,
  initial,
  lockedLeadId,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial?: Partial<Task>;
  /** When set, leadId is fixed and the typeahead is hidden. */
  lockedLeadId?: string;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (input: CreateTaskInput) => void;
}) {
  const { can } = useAuth();
  const canAssignOthers = can('crm.task.assign');
  const canSeeMembers = can('member.read');

  const [form, setForm] = useState<CreateTaskInput>({
    leadId: '',
    title: '',
    kind: 'general',
    context: 'none',
    priority: 'medium',
  });

  // Workspace members (for assignee picker). Only fetched if the caller can read them.
  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: () => membersApi.list(),
    enabled: open && canSeeMembers,
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      leadId: initial?.leadId ?? lockedLeadId ?? '',
      contactId: initial?.contactId ?? undefined,
      title: initial?.title ?? '',
      description: initial?.description ?? '',
      kind: initial?.kind ?? 'general',
      context: initial?.context ?? 'none',
      priority: initial?.priority ?? 'medium',
      dueAt: initial?.dueAt ?? undefined,
      assignedTo: initial?.assignedTo ?? '',
      assigneeId: initial?.assigneeId ?? undefined,
    });
  }, [open, initial, lockedLeadId]);

  // Contacts dropdown is filtered to the chosen lead.
  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts', form.leadId || 'none'],
    queryFn: () => api.listContacts(form.leadId),
    enabled: !!form.leadId,
  });

  if (!open) return null;

  const isEdit = !!initial?.id;
  const canSave =
    form.title.trim().length > 0 && !!form.leadId && !pending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-lg shadow-e3 w-full max-w-lg max-h-[90vh] overflow-auto">
        <header className="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <h2 className="text-h3">{isEdit ? 'Edit task' : 'New task'}</h2>
          <button
            onClick={onClose}
            className="text-neutral hover:text-error"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>
        <form
          className="p-5 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) {
              const payload: CreateTaskInput = {
                ...form,
                title: form.title.trim(),
                dueAt: form.dueAt ? toIso(form.dueAt) : undefined,
                contactId: form.contactId || undefined,
                description: form.description?.trim() || undefined,
                assignedTo: form.assignedTo?.trim() || undefined,
                assigneeId: form.assigneeId || undefined,
              };
              onSubmit(payload);
            }
          }}
        >
          <Field label="Title *">
            <Input
              autoFocus
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>

          {!lockedLeadId && (
            <Field label="Lead *">
              <LeadTypeahead
                value={form.leadId || null}
                onChange={(id) =>
                  setForm({ ...form, leadId: id ?? '', contactId: undefined })
                }
              />
            </Field>
          )}

          <Field label="Description">
            <textarea
              value={form.description ?? ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 text-bodysm rounded-md border border-border bg-surface placeholder:text-neutral focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 resize-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Kind">
              <Select
                value={form.kind ?? 'general'}
                onChange={(v) => setForm({ ...form, kind: v as TaskKind })}
                options={TASK_KINDS}
                labels={(v) => (v === 'general' ? 'General' : 'Follow-up')}
              />
            </Field>
            <Field label="Priority">
              <Select
                value={form.priority ?? 'medium'}
                onChange={(v) =>
                  setForm({ ...form, priority: v as TaskPriority })
                }
                options={TASK_PRIORITIES}
                labels={(v) => priorityLabel(v as TaskPriority)}
              />
            </Field>
          </div>

          <Field label="Context">
            <Select
              value={form.context ?? 'none'}
              onChange={(v) =>
                setForm({ ...form, context: v as TaskContext })
              }
              options={TASK_CONTEXTS}
              labels={(v) => contextLabel(v as TaskContext)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Due">
              <Input
                type="datetime-local"
                value={form.dueAt ? toLocalInput(form.dueAt) : ''}
                onChange={(e) =>
                  setForm({ ...form, dueAt: e.target.value || undefined })
                }
              />
            </Field>
            <Field label="Assignee">
              {canSeeMembers && canAssignOthers ? (
                <Select
                  value={form.assigneeId ?? ''}
                  onChange={(v) => setForm({ ...form, assigneeId: v || undefined })}
                  options={['', ...members.filter((m) => m.status === 'active').map((m) => m.id)]}
                  labels={(v) => {
                    if (v === '') return 'Unassigned';
                    const m = members.find((x) => x.id === v);
                    return m ? `${m.user.name} (${m.role.name})` : 'Unknown';
                  }}
                />
              ) : (
                <Input
                  value={form.assignedTo ?? ''}
                  onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
                  placeholder="Free text"
                />
              )}
            </Field>
          </div>

          {form.leadId && contacts.length > 0 && (
            <Field label="Related contact (optional)">
              <Select
                value={form.contactId ?? ''}
                onChange={(v) =>
                  setForm({ ...form, contactId: v || undefined })
                }
                options={['', ...contacts.map((c) => c.id)]}
                labels={(v) =>
                  v === ''
                    ? 'None'
                    : contacts.find((c) => c.id === v)?.name ?? 'Unknown'
                }
              />
            </Field>
          )}

          {error && (
            <div className="text-caption text-error truncate" title={error}>
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave}>
              {isEdit ? 'Save' : 'Create task'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-caption uppercase tracking-wider text-neutral mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}

function Select<T extends string>({
  value,
  onChange,
  options,
  labels,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly T[];
  labels: (v: T) => string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 px-2 w-full rounded-md border border-border bg-surface text-bodysm text-ink focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {labels(o)}
        </option>
      ))}
    </select>
  );
}

/** Convert ISO → datetime-local input format (no timezone). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toIso(localOrIso: string): string {
  // datetime-local has no timezone — interpret as local, then ISO it.
  if (localOrIso.endsWith('Z') || /[+-]\d\d:\d\d$/.test(localOrIso)) {
    return localOrIso;
  }
  return new Date(localOrIso).toISOString();
}
