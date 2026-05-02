'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  api,
  CreateMeetingInput,
  Meeting,
  MeetingStatus,
  MeetingType,
} from '@/lib/api';
import {
  MEETING_STATUSES,
  MEETING_TYPES,
  meetingStatusLabel,
  meetingTypeLabel,
} from '@/lib/meetings';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { LeadTypeahead } from '../tasks/LeadTypeahead';
import { X } from 'lucide-react';

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];

const TYPE_LINK_PLACEHOLDER: Record<MeetingType, string> = {
  phone: '+1 (555) 123-4567',
  zoom: 'https://zoom.us/j/...',
  google_meet: 'https://meet.google.com/...',
  in_person: 'Office, 2nd floor',
  other: '',
};

/**
 * Create / edit a meeting. When `lockedLeadId` is set the lead picker is
 * hidden — used from the lead-detail meetings panel.
 *
 * On the edit-mode status dropdown, switching to "completed" reveals a
 * "Next action" hint banner so the user captures the follow-up intent
 * (which becomes the auto-created task's description).
 */
export function MeetingFormModal({
  open,
  initial,
  lockedLeadId,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial?: Partial<Meeting>;
  lockedLeadId?: string;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (input: CreateMeetingInput & { status?: MeetingStatus }) => void;
}) {
  const [form, setForm] = useState<CreateMeetingInput & { status?: MeetingStatus }>({
    leadId: '',
    title: '',
    type: 'phone',
    scheduledAt: '',
    durationMin: 30,
    attendeeEmails: [],
  });
  const [attendeeDraft, setAttendeeDraft] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm({
      leadId: initial?.leadId ?? lockedLeadId ?? '',
      contactId: initial?.contactId ?? undefined,
      accountId: initial?.accountId ?? undefined,
      title: initial?.title ?? '',
      type: initial?.type ?? 'phone',
      meetingLink: initial?.meetingLink ?? '',
      scheduledAt: initial?.scheduledAt ?? '',
      durationMin: initial?.durationMin ?? 30,
      status: initial?.status,
      notes: initial?.notes ?? '',
      nextAction: initial?.nextAction ?? '',
      assignedTo: initial?.assignedTo ?? '',
      attendeeEmails: initial?.attendeeEmails ?? [],
    });
    setAttendeeDraft('');
  }, [open, initial, lockedLeadId]);

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts', form.leadId || 'none'],
    queryFn: () => api.listContacts(form.leadId),
    enabled: !!form.leadId,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: api.listEmailAccounts,
  });

  // Auto-fill the first attendee from selected contact / lead.email when
  // creating a new meeting and the field is still empty.
  useEffect(() => {
    if (!open || isEditMode(initial) || (form.attendeeEmails ?? []).length > 0) return;
    if (form.contactId) {
      const c = contacts.find((x) => x.id === form.contactId);
      if (c?.email) {
        setForm((f) => ({ ...f, attendeeEmails: [c.email!] }));
        return;
      }
    }
    const primary = contacts.find((c) => c.isPrimary && c.email);
    if (primary?.email) {
      setForm((f) => ({ ...f, attendeeEmails: [primary.email!] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.leadId, form.contactId, contacts, open]);

  if (!open) return null;
  const isEdit = isEditMode(initial);
  const canSave =
    form.title.trim().length > 0 &&
    !!form.leadId &&
    !!form.scheduledAt &&
    !pending;

  const completing = isEdit && form.status === 'completed' && initial?.status !== 'completed';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-lg shadow-e3 w-full max-w-lg max-h-[92vh] overflow-auto">
        <header className="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <h2 className="text-h3">{isEdit ? 'Edit meeting' : 'New meeting'}</h2>
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
              // Flush any in-progress draft attendee email so the user
              // doesn't have to press Enter explicitly.
              const trailing = attendeeDraft.trim().replace(/,$/, '');
              const finalAttendees = [...(form.attendeeEmails ?? [])];
              if (trailing && !finalAttendees.map((x) => x.toLowerCase()).includes(trailing.toLowerCase())) {
                finalAttendees.push(trailing);
              }
              const payload: CreateMeetingInput & { status?: MeetingStatus } = {
                ...form,
                title: form.title.trim(),
                meetingLink: form.meetingLink?.trim() || undefined,
                scheduledAt: toIso(form.scheduledAt),
                contactId: form.contactId || undefined,
                accountId: form.accountId || undefined,
                notes: form.notes?.trim() || undefined,
                nextAction: form.nextAction?.trim() || undefined,
                assignedTo: form.assignedTo?.trim() || undefined,
                attendeeEmails: finalAttendees,
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
              placeholder="Discovery call with Maria"
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

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select
                value={form.type ?? 'phone'}
                onChange={(v) => setForm({ ...form, type: v as MeetingType })}
                options={MEETING_TYPES}
                labels={(v) => meetingTypeLabel(v as MeetingType)}
              />
            </Field>
            <Field label="Duration">
              <Select
                value={String(form.durationMin ?? 30)}
                onChange={(v) => setForm({ ...form, durationMin: Number(v) })}
                options={DURATION_PRESETS.map((m) => String(m))}
                labels={(v) => `${v} min`}
              />
            </Field>
          </div>

          <Field label="When *">
            <Input
              type="datetime-local"
              required
              value={form.scheduledAt ? toLocalInput(form.scheduledAt) : ''}
              onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
            />
          </Field>

          <Field
            label={
              form.type === 'in_person'
                ? 'Location'
                : form.type === 'phone'
                ? 'Phone number'
                : 'Meeting link'
            }
          >
            <Input
              value={form.meetingLink ?? ''}
              onChange={(e) => setForm({ ...form, meetingLink: e.target.value })}
              placeholder={TYPE_LINK_PLACEHOLDER[form.type ?? 'phone']}
            />
          </Field>

          {form.leadId && contacts.length > 0 && (
            <Field label="Contact (optional)">
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

          {/* Google Account picker — drives which Calendar the event lands on. */}
          <Field label="Google account (for Calendar invite)">
            <select
              value={form.accountId ?? ''}
              onChange={(e) =>
                setForm({ ...form, accountId: e.target.value || undefined })
              }
              className="h-10 px-2 w-full rounded-md border border-border bg-surface text-bodysm text-ink focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
            >
              <option value="">Auto-pick (server decides)</option>
              {accounts.map((a) => (
                <option
                  key={a.id}
                  value={a.id}
                  disabled={!a.hasCalendarScope}
                >
                  {a.email}
                  {!a.hasCalendarScope ? '  — missing Calendar scope' : ''}
                </option>
              ))}
            </select>
            {accounts.length > 0 && !accounts.some((a) => a.hasCalendarScope) && (
              <div className="text-caption text-warning mt-1">
                None of your connected accounts has the Calendar scope.
                Disconnect + reconnect from Settings to grant it.
              </div>
            )}
          </Field>

          <Field label="Attendees">
            <div className="rounded-md border border-border bg-surface px-2 py-1.5 flex flex-wrap items-center gap-1 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 transition">
              {(form.attendeeEmails ?? []).map((em) => (
                <span
                  key={em}
                  className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-primary/10 text-primary text-[12px] font-medium"
                >
                  {em}
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        attendeeEmails: (form.attendeeEmails ?? []).filter(
                          (x) => x !== em,
                        ),
                      })
                    }
                    className="opacity-70 hover:opacity-100"
                    aria-label={`Remove ${em}`}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
              <input
                type="email"
                value={attendeeDraft}
                onChange={(e) => setAttendeeDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',' || e.key === ' ' || e.key === 'Tab') {
                    const v = attendeeDraft.trim().replace(/,$/, '');
                    if (v) {
                      e.preventDefault();
                      const lower = v.toLowerCase();
                      if (!(form.attendeeEmails ?? []).map((x) => x.toLowerCase()).includes(lower)) {
                        setForm({
                          ...form,
                          attendeeEmails: [...(form.attendeeEmails ?? []), v],
                        });
                      }
                      setAttendeeDraft('');
                    }
                  }
                }}
                onBlur={() => {
                  const v = attendeeDraft.trim().replace(/,$/, '');
                  if (v) {
                    const lower = v.toLowerCase();
                    if (!(form.attendeeEmails ?? []).map((x) => x.toLowerCase()).includes(lower)) {
                      setForm({
                        ...form,
                        attendeeEmails: [...(form.attendeeEmails ?? []), v],
                      });
                    }
                    setAttendeeDraft('');
                  }
                }}
                placeholder={(form.attendeeEmails ?? []).length === 0 ? 'name@example.com' : ''}
                className="flex-1 min-w-[140px] h-7 bg-transparent text-bodysm focus:outline-none placeholder:text-neutral"
              />
            </div>
            <div className="text-caption text-ink-muted mt-1">
              Attendees receive a calendar invite from Google when this
              meeting is created.
            </div>
          </Field>

          <Field label="Notes">
            <textarea
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 text-bodysm rounded-md border border-border bg-surface placeholder:text-neutral focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 resize-none"
            />
          </Field>

          {isEdit && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <Select
                  value={form.status ?? 'scheduled'}
                  onChange={(v) =>
                    setForm({ ...form, status: v as MeetingStatus })
                  }
                  options={MEETING_STATUSES}
                  labels={(v) => meetingStatusLabel(v as MeetingStatus)}
                />
              </Field>
              <Field label="Assigned to">
                <Input
                  value={form.assignedTo ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, assignedTo: e.target.value })
                  }
                  placeholder="Free text"
                />
              </Field>
            </div>
          )}

          {(completing || form.status === 'completed') && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
              <Field label="Next action (becomes the follow-up task)">
                <Input
                  value={form.nextAction ?? ''}
                  onChange={(e) => setForm({ ...form, nextAction: e.target.value })}
                  placeholder="Send proposal, loop in finance, schedule demo…"
                />
              </Field>
              <div className="text-caption text-ink-muted mt-2">
                Saving this meeting as <strong>completed</strong> will
                auto-create a "Meeting follow-up" task on this lead due
                in 2 days. The text above becomes that task's description.
              </div>
            </div>
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
              {isEdit ? 'Save' : 'Schedule meeting'}
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

function isEditMode(initial: Partial<Meeting> | undefined): boolean {
  return !!initial?.id;
}

function toLocalInput(iso: string): string {
  // datetime-local needs YYYY-MM-DDTHH:MM in LOCAL time, no tz suffix.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIso(localOrIso: string): string {
  if (!localOrIso) return localOrIso;
  if (localOrIso.endsWith('Z') || /[+-]\d\d:\d\d$/.test(localOrIso)) {
    return localOrIso;
  }
  return new Date(localOrIso).toISOString();
}
