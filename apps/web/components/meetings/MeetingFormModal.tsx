'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  api,
  CreateMeetingInput,
  Meeting,
  MeetingConflictSummary,
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
import { AlertTriangle, X } from 'lucide-react';

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
    sendInvite: false,
    emailMessage: '',
    emailSubject: '',
  });
  const [attendeeDraft, setAttendeeDraft] = useState('');
  // Tracks whether the user manually edited the email body so we don't
  // clobber their edits when the auto-generated template would change.
  const [emailDirty, setEmailDirty] = useState(false);

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
      sendInvite: false,
      emailMessage: '',
      emailSubject: '',
    });
    setAttendeeDraft('');
    setEmailDirty(false);
  }, [open, initial, lockedLeadId]);

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

  const { data: accounts = [] } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: api.listEmailAccounts,
  });

  // Suggested attendee pool: every email we know for this business —
  // every contact with an email + the lead.email if set. Deduped, lower-
  // case keyed, sorted with primary contact first.
  const suggestedEmails: { email: string; label: string; isPrimary: boolean }[] = useMemo(() => {
    const seen = new Set<string>();
    const out: { email: string; label: string; isPrimary: boolean }[] = [];
    const sortedContacts = [...contacts].sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return (a.name ?? '').localeCompare(b.name ?? '');
    });
    for (const c of sortedContacts) {
      if (!c.email) continue;
      const key = c.email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        email: c.email,
        label: c.name ? `${c.name} · ${c.email}` : c.email,
        isPrimary: !!c.isPrimary,
      });
    }
    if (lead?.email) {
      const key = lead.email.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ email: lead.email, label: `Lead · ${lead.email}`, isPrimary: false });
      }
    }
    return out;
  }, [contacts, lead?.email]);

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

  // Resolve which account the live conflict-check should target. We only
  // run the check when there's a concrete account to query against —
  // "auto-pick" leaves account resolution to the server, where
  // assertNoConflict still runs and returns 409 if there's a clash.
  const effectiveAccountId = form.accountId || initial?.accountId || '';
  const effectiveStatus = form.status ?? initial?.status ?? 'scheduled';

  // Debounce the (accountId, scheduledAt, durationMin) tuple by 350ms so
  // we don't hammer the API on every keystroke / scrub.
  const [debounced, setDebounced] = useState<{
    accountId: string;
    scheduledAt: string;
    durationMin: number;
  } | null>(null);
  useEffect(() => {
    if (!open) return;
    if (
      !effectiveAccountId ||
      !form.scheduledAt ||
      !form.durationMin ||
      effectiveStatus !== 'scheduled'
    ) {
      setDebounced(null);
      return;
    }
    const t = setTimeout(() => {
      setDebounced({
        accountId: effectiveAccountId,
        scheduledAt: toIso(form.scheduledAt),
        durationMin: form.durationMin!,
      });
    }, 350);
    return () => clearTimeout(t);
  }, [open, effectiveAccountId, form.scheduledAt, form.durationMin, effectiveStatus]);

  const conflictKey = useMemo(
    () =>
      debounced
        ? [
            'meeting-conflict',
            debounced.accountId,
            debounced.scheduledAt,
            debounced.durationMin,
            initial?.id ?? '',
          ]
        : ['meeting-conflict', 'idle'],
    [debounced, initial?.id],
  );
  const conflictQuery = useQuery({
    queryKey: conflictKey,
    queryFn: () =>
      api.checkMeetingConflict({
        accountId: debounced!.accountId,
        scheduledAt: debounced!.scheduledAt,
        durationMin: debounced!.durationMin,
        excludeMeetingId: initial?.id,
      }),
    enabled: !!debounced,
    staleTime: 5_000,
  });
  const conflict: MeetingConflictSummary | null =
    conflictQuery.data?.conflict ?? null;

  if (!open) return null;
  const isEdit = isEditMode(initial);
  const canSave =
    form.title.trim().length > 0 &&
    !!form.leadId &&
    !!form.scheduledAt &&
    !pending &&
    !conflict;

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
                sendInvite: !!form.sendInvite && finalAttendees.length > 0,
                // Only forward override copy when the user actually edited
                // it — otherwise the server renders the template fresh
                // (which can include the auto-generated Meet link).
                emailMessage: emailDirty
                  ? (form.emailMessage ?? '').trim() || undefined
                  : undefined,
                emailSubject: form.emailSubject?.trim() || undefined,
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
              placeholder={
                form.type === 'google_meet' && !isEdit
                  ? 'Auto-generated when you save'
                  : TYPE_LINK_PLACEHOLDER[form.type ?? 'phone']
              }
            />
            {form.type === 'google_meet' && !form.meetingLink && (
              <div className="text-caption text-ink-muted mt-1">
                A Google Meet link will be created automatically and
                attached to the calendar invite.
              </div>
            )}
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
            {(suggestedEmails.length > 0 || (form.attendeeEmails ?? []).length > 0) && (
              <div className="rounded-md border border-border bg-surface p-2 space-y-1.5">
                {suggestedEmails.map((s) => {
                  const lower = s.email.toLowerCase();
                  const checked = (form.attendeeEmails ?? [])
                    .map((x) => x.toLowerCase())
                    .includes(lower);
                  return (
                    <label
                      key={s.email}
                      className="flex items-center gap-2 text-bodysm text-ink cursor-pointer hover:bg-background rounded px-1.5 py-1"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = (form.attendeeEmails ?? []).filter(
                            (x) => x.toLowerCase() !== lower,
                          );
                          if (e.target.checked) next.push(s.email);
                          setForm({ ...form, attendeeEmails: next });
                        }}
                        className="accent-primary"
                      />
                      <span className="truncate">{s.label}</span>
                      {s.isPrimary && (
                        <span className="text-caption text-primary">primary</span>
                      )}
                    </label>
                  );
                })}
                {/* Free-form additions that aren't on the contacts list */}
                {(form.attendeeEmails ?? [])
                  .filter(
                    (em) =>
                      !suggestedEmails.some(
                        (s) => s.email.toLowerCase() === em.toLowerCase(),
                      ),
                  )
                  .map((em) => (
                    <div
                      key={em}
                      className="flex items-center gap-2 text-bodysm text-ink px-1.5 py-1"
                    >
                      <input
                        type="checkbox"
                        checked
                        onChange={() =>
                          setForm({
                            ...form,
                            attendeeEmails: (form.attendeeEmails ?? []).filter(
                              (x) => x !== em,
                            ),
                          })
                        }
                        className="accent-primary"
                      />
                      <span className="truncate">{em}</span>
                      <span className="text-caption text-ink-muted">other</span>
                    </div>
                  ))}
              </div>
            )}
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="email"
                value={attendeeDraft}
                onChange={(e) => setAttendeeDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    const v = attendeeDraft.trim().replace(/,$/, '');
                    if (v) {
                      e.preventDefault();
                      const lower = v.toLowerCase();
                      if (
                        !(form.attendeeEmails ?? [])
                          .map((x) => x.toLowerCase())
                          .includes(lower)
                      ) {
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
                    if (
                      !(form.attendeeEmails ?? [])
                        .map((x) => x.toLowerCase())
                        .includes(lower)
                    ) {
                      setForm({
                        ...form,
                        attendeeEmails: [...(form.attendeeEmails ?? []), v],
                      });
                    }
                    setAttendeeDraft('');
                  }
                }}
                placeholder="Add other email…"
                className="flex-1 h-9 px-2 rounded-md border border-border bg-surface text-bodysm text-ink focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
              />
            </div>
            <div className="text-caption text-ink-muted mt-1">
              Selected attendees receive a Google Calendar invite. Toggle
              the email below to also send a personalized message from
              your inbox.
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

          {!isEdit && (form.attendeeEmails ?? []).length > 0 && (
            <div className="rounded-md border border-border p-3 bg-background/50">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!form.sendInvite}
                  onChange={(e) =>
                    setForm({ ...form, sendInvite: e.target.checked })
                  }
                  className="accent-primary mt-0.5"
                />
                <div className="text-bodysm text-ink">
                  Also send a personalized email to attendees
                  <div className="text-caption text-ink-muted mt-0.5">
                    On top of the calendar invite, send a one-to-one
                    message from your inbox using the title, notes, and
                    join link below.
                  </div>
                </div>
              </label>
              {form.sendInvite && (
                <div className="mt-3 space-y-2">
                  <Field label="Subject">
                    <Input
                      value={form.emailSubject ?? ''}
                      onChange={(e) =>
                        setForm({ ...form, emailSubject: e.target.value })
                      }
                      placeholder={`Invitation: ${form.title || 'Meeting'}`}
                    />
                  </Field>
                  <Field label="Message">
                    <textarea
                      value={
                        emailDirty
                          ? form.emailMessage ?? ''
                          : defaultInviteBody({
                              title: form.title,
                              notes: form.notes,
                              type: form.type ?? 'phone',
                              meetingLink: form.meetingLink ?? '',
                              scheduledAt: form.scheduledAt,
                              durationMin: form.durationMin ?? 30,
                              contactName:
                                contacts.find((c) => c.id === form.contactId)?.name ??
                                contacts.find((c) => c.isPrimary)?.name ??
                                null,
                              businessName: lead?.businessName ?? null,
                            })
                      }
                      onChange={(e) => {
                        setEmailDirty(true);
                        setForm({ ...form, emailMessage: e.target.value });
                      }}
                      rows={8}
                      className="w-full px-3 py-2 text-bodysm rounded-md border border-border bg-surface placeholder:text-neutral focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 resize-y"
                    />
                  </Field>
                  <div className="text-caption text-ink-muted">
                    Leave the message untouched to use the auto-generated
                    template — title + notes + join link.
                    {form.type === 'google_meet' && !form.meetingLink && (
                      <> The Google Meet link is added after save.</>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

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

          {conflict && (
            <div className="rounded-md border border-error/40 bg-error/5 p-3 flex gap-2 items-start">
              <AlertTriangle size={14} className="text-error mt-0.5 shrink-0" />
              <div className="text-bodysm text-error">
                <div className="font-medium">Time conflict on this account</div>
                <div className="text-caption text-ink-muted mt-0.5">
                  Overlaps with{' '}
                  <strong className="text-ink">{conflict.title}</strong>
                  {' · '}
                  {formatConflictWhen(conflict.scheduledAt, conflict.durationMin)}
                  {' · '}
                  <span className="text-ink-muted">
                    {conflict.leadBusinessName}
                  </span>
                </div>
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

function defaultInviteBody(input: {
  title: string;
  notes?: string | null;
  type: MeetingType;
  meetingLink: string;
  scheduledAt: string;
  durationMin: number;
  contactName: string | null;
  businessName: string | null;
}): string {
  const greeting = input.contactName?.trim()
    ? `Hi ${input.contactName.trim().split(/\s+/)[0]},`
    : 'Hi,';
  const start = input.scheduledAt ? new Date(toIso(input.scheduledAt)) : null;
  const when =
    start && !Number.isNaN(start.getTime())
      ? formatConflictWhen(start.toISOString(), input.durationMin)
      : '';
  const linkLabel =
    input.type === 'google_meet'
      ? 'Join Google Meet'
      : input.type === 'zoom'
      ? 'Join Zoom'
      : input.type === 'phone'
      ? 'Phone'
      : 'Join';
  const lines: string[] = [];
  lines.push(greeting);
  lines.push('');
  if (input.businessName) {
    lines.push(
      `Looking forward to our ${input.title || 'meeting'} with ${input.businessName}${when ? ` on ${when}` : ''}.`,
    );
  } else {
    lines.push(
      `Looking forward to our ${input.title || 'meeting'}${when ? ` on ${when}` : ''}.`,
    );
  }
  if (input.notes && input.notes.trim().length > 0) {
    lines.push('');
    lines.push(input.notes.trim());
  }
  if (input.meetingLink) {
    lines.push('');
    lines.push(`${linkLabel}: ${input.meetingLink}`);
  }
  lines.push('');
  lines.push('Talk soon.');
  return lines.join('\n');
}

function formatConflictWhen(iso: string, durationMin: number): string {
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return '';
  const end = new Date(start.getTime() + durationMin * 60_000);
  const sameDay =
    start.toDateString() === end.toDateString();
  const date = start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const t = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return sameDay
    ? `${date}, ${t(start)}–${t(end)}`
    : `${date} ${t(start)} → ${end.toLocaleDateString()} ${t(end)}`;
}
