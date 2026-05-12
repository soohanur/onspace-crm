'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  api,
  Call,
  CallDirection,
  CallOutcome,
  CallStatus,
  CreateCallInput,
} from '@/lib/api';
import {
  CALL_OUTCOMES,
  CALL_STATUSES,
  directionLabel,
  outcomeLabel,
  statusLabel,
} from '@/lib/calls';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { LeadTypeahead } from '../tasks/LeadTypeahead';
import { PhoneIncoming, PhoneOutgoing, X } from 'lucide-react';

/**
 * Phase 12 — manual call log form. Modeled on MeetingFormModal. No
 * explicit title field: the title is implicit (rendered in lists from
 * direction + outcome). The "Their number" field is direction-aware:
 * mapped to `toPhone` for outbound and `fromPhone` for inbound on save.
 */
export function CallFormModal({
  open,
  initial,
  lockedLeadId,
  defaultStatus,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial?: Partial<Call>;
  lockedLeadId?: string;
  /** Used on first open (and when there's no `initial`) to pick the
   *  default for `status` and the default `occurredAt`. "+ Log a call"
   *  passes 'completed' (now); "+ Schedule a call" passes 'scheduled'
   *  (tomorrow 9am). Edit-mode reads `initial.status` instead. */
  defaultStatus?: CallStatus;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (input: CreateCallInput & { status?: CallStatus }) => void;
}) {
  const isEdit = !!initial?.id;
  const initialStatus: CallStatus = isEdit
    ? (initial?.status as CallStatus) ?? 'completed'
    : defaultStatus ?? 'completed';

  const [form, setForm] = useState<{
    leadId: string;
    contactId: string;
    direction: CallDirection;
    theirPhone: string;
    occurredAt: string;
    durationMin: string;
    durationSec: string;
    outcome: CallOutcome | '';
    status: CallStatus;
    notes: string;
    voicemailLeft: boolean;
    nextAction: string;
    assignedTo: string;
  }>({
    leadId: '',
    contactId: '',
    direction: 'outbound',
    theirPhone: '',
    occurredAt: '',
    durationMin: '',
    durationSec: '',
    outcome: '',
    status: 'completed',
    notes: '',
    voicemailLeft: false,
    nextAction: '',
    assignedTo: '',
  });

  useEffect(() => {
    if (!open) return;
    const dir = (initial?.direction as CallDirection) ?? 'outbound';
    const status: CallStatus = isEdit
      ? (initial?.status as CallStatus) ?? 'completed'
      : defaultStatus ?? 'completed';
    const theirPhone =
      (dir === 'outbound'
        ? initial?.toPhone ?? ''
        : initial?.fromPhone ?? '') ?? '';
    let occurredAt = initial?.occurredAt ?? '';
    if (!occurredAt) {
      if (status === 'scheduled') {
        const t = new Date();
        t.setDate(t.getDate() + 1);
        t.setHours(9, 0, 0, 0);
        occurredAt = t.toISOString();
      } else {
        occurredAt = new Date().toISOString();
      }
    }
    const sec = initial?.durationSec ?? null;
    const mins = sec != null ? Math.floor(sec / 60) : '';
    const rest = sec != null ? sec % 60 : '';
    setForm({
      leadId: initial?.leadId ?? lockedLeadId ?? '',
      contactId: initial?.contactId ?? '',
      direction: dir,
      theirPhone,
      occurredAt,
      durationMin: mins === '' ? '' : String(mins),
      durationSec: rest === '' ? '' : String(rest),
      outcome: (initial?.outcome as CallOutcome) ?? '',
      status,
      notes: initial?.notes ?? '',
      voicemailLeft: initial?.voicemailLeft ?? false,
      nextAction: initial?.nextAction ?? '',
      assignedTo: initial?.assignedTo ?? '',
    });
  }, [open, initial, lockedLeadId, defaultStatus, isEdit]);

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts', form.leadId || 'none'],
    queryFn: () => api.listContacts(form.leadId),
    enabled: !!form.leadId,
  });
  const { data: lead } = useQuery({
    queryKey: ['lead', form.leadId || 'none'],
    queryFn: () => api.getLead(form.leadId),
    enabled: !!form.leadId,
  });

  // Auto-fill the "their number" field from the selected contact (or
  // primary contact, or lead.phone) when the field is still empty. Only
  // runs while creating; never clobbers an explicit edit.
  useEffect(() => {
    if (!open || isEdit || form.theirPhone.trim().length > 0) return;
    if (form.contactId) {
      const c = contacts.find((x) => x.id === form.contactId);
      if (c?.phone) {
        setForm((f) => ({ ...f, theirPhone: c.phone! }));
        return;
      }
    }
    const primary = contacts.find((c) => c.isPrimary && c.phone);
    if (primary?.phone) {
      setForm((f) => ({ ...f, theirPhone: primary.phone! }));
      return;
    }
    if (lead?.phone) {
      setForm((f) => ({ ...f, theirPhone: lead.phone! }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.leadId, form.contactId, contacts, lead?.phone, open]);

  if (!open) return null;

  const minutes = form.durationMin === '' ? null : Number(form.durationMin);
  const seconds = form.durationSec === '' ? null : Number(form.durationSec);
  const durationSec =
    minutes == null && seconds == null
      ? null
      : (minutes ?? 0) * 60 + (seconds ?? 0);

  const requiresOutcome = form.status === 'completed';
  const canSave =
    !!form.leadId &&
    !!form.occurredAt &&
    (!requiresOutcome || form.outcome !== '') &&
    !pending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-lg shadow-e3 w-full max-w-lg max-h-[92vh] overflow-auto">
        <header className="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <h2 className="text-h3">
            {isEdit
              ? 'Edit call'
              : initialStatus === 'scheduled'
              ? 'Schedule a call'
              : 'Log a call'}
          </h2>
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
            if (!canSave) return;
            const phoneTrimmed = form.theirPhone.trim();
            const payload: CreateCallInput & { status?: CallStatus } = {
              leadId: form.leadId,
              contactId: form.contactId || undefined,
              direction: form.direction,
              toPhone:
                form.direction === 'outbound'
                  ? phoneTrimmed || undefined
                  : undefined,
              fromPhone:
                form.direction === 'inbound'
                  ? phoneTrimmed || undefined
                  : undefined,
              occurredAt: toIso(form.occurredAt),
              durationSec:
                durationSec == null ? undefined : Math.max(0, durationSec),
              outcome:
                form.status === 'completed'
                  ? (form.outcome as CallOutcome) || undefined
                  : undefined,
              status: form.status,
              notes: form.notes.trim() || undefined,
              voicemailLeft:
                form.direction === 'outbound' &&
                (form.outcome === 'no_answer' || form.outcome === 'voicemail')
                  ? form.voicemailLeft
                  : undefined,
              nextAction: form.nextAction.trim() || undefined,
              assignedTo: form.assignedTo.trim() || undefined,
            };
            onSubmit(payload);
          }}
        >
          {!lockedLeadId && (
            <Field label="Lead *">
              <LeadTypeahead
                value={form.leadId || null}
                onChange={(id) =>
                  setForm({ ...form, leadId: id ?? '', contactId: '' })
                }
              />
            </Field>
          )}

          <Field label="Direction">
            <div className="flex gap-2">
              <DirectionPill
                active={form.direction === 'outbound'}
                onClick={() => setForm({ ...form, direction: 'outbound' })}
              >
                <PhoneOutgoing size={12} /> {directionLabel('outbound')}
              </DirectionPill>
              <DirectionPill
                active={form.direction === 'inbound'}
                onClick={() => setForm({ ...form, direction: 'inbound' })}
              >
                <PhoneIncoming size={12} /> {directionLabel('inbound')}
              </DirectionPill>
            </div>
          </Field>

          {form.leadId && contacts.length > 0 && (
            <Field label="Contact (optional)">
              <Select
                value={form.contactId}
                onChange={(v) => {
                  // Picking a contact swaps in that contact's number
                  // (clears it when "None" or the contact has no phone),
                  // so changing the owner actually changes the number.
                  const c = v ? contacts.find((x) => x.id === v) : undefined;
                  setForm({
                    ...form,
                    contactId: v,
                    theirPhone: c?.phone ?? '',
                  });
                }}
                options={['', ...contacts.map((c) => c.id)]}
                labels={(v) =>
                  v === ''
                    ? 'None'
                    : contacts.find((c) => c.id === v)?.name ?? 'Unknown'
                }
              />
            </Field>
          )}

          <Field label="Their number">
            <Input
              value={form.theirPhone}
              onChange={(e) => setForm({ ...form, theirPhone: e.target.value })}
              placeholder="+1 (555) 123-4567"
            />
          </Field>

          <Field
            label={form.status === 'scheduled' ? 'Scheduled for *' : 'Occurred at *'}
          >
            <Input
              type="datetime-local"
              required
              value={form.occurredAt ? toLocalInput(form.occurredAt) : ''}
              onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
            />
          </Field>

          {form.status === 'completed' && (
            <Field label="Duration (mm:ss)">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={1440}
                  value={form.durationMin}
                  onChange={(e) =>
                    setForm({ ...form, durationMin: e.target.value })
                  }
                  placeholder="min"
                  className="w-24"
                />
                <span className="text-neutral">:</span>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={form.durationSec}
                  onChange={(e) =>
                    setForm({ ...form, durationSec: e.target.value })
                  }
                  placeholder="sec"
                  className="w-24"
                />
              </div>
            </Field>
          )}

          {form.status === 'completed' && (
            <Field label="Outcome *">
              <Select
                value={form.outcome}
                onChange={(v) => setForm({ ...form, outcome: v as CallOutcome | '' })}
                options={['', ...CALL_OUTCOMES]}
                labels={(v) => (v === '' ? 'Select…' : outcomeLabel(v as CallOutcome))}
              />
            </Field>
          )}

          {isEdit && (
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(v) => setForm({ ...form, status: v as CallStatus })}
                options={CALL_STATUSES}
                labels={(v) => statusLabel(v as CallStatus)}
              />
            </Field>
          )}

          {form.direction === 'outbound' &&
            form.status === 'completed' &&
            (form.outcome === 'no_answer' || form.outcome === 'voicemail') && (
              <label className="flex items-center gap-2 cursor-pointer text-bodysm text-ink">
                <input
                  type="checkbox"
                  checked={form.voicemailLeft}
                  onChange={(e) =>
                    setForm({ ...form, voicemailLeft: e.target.checked })
                  }
                  className="accent-primary"
                />
                Left a voicemail
              </label>
            )}

          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 text-bodysm rounded-md border border-border bg-surface placeholder:text-neutral focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 resize-none"
            />
          </Field>

          <Field label="Next action">
            <Input
              value={form.nextAction}
              onChange={(e) => setForm({ ...form, nextAction: e.target.value })}
              placeholder="What's the next step? E.g. 'Send proposal', 'Schedule meeting'"
            />
          </Field>

          <Field label="Assigned to">
            <Input
              value={form.assignedTo}
              onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
              placeholder="Free text"
            />
          </Field>

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
              {isEdit
                ? 'Save'
                : form.status === 'scheduled'
                ? 'Schedule call'
                : 'Log call'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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

function DirectionPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-bodysm font-medium border transition-colors ' +
        (active
          ? 'bg-primary text-white border-primary'
          : 'bg-surface text-ink-muted border-border hover:border-primary')
      }
    >
      {children}
    </button>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIso(localOrIso: string): string {
  if (!localOrIso) return localOrIso;
  if (localOrIso.endsWith('Z') || /[+-]\d\d:\d\d$/.test(localOrIso)) return localOrIso;
  return new Date(localOrIso).toISOString();
}
