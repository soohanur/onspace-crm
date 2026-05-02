'use client';

import { useEffect, useState } from 'react';
import {
  Contact,
  ContactSource,
  ContactStatus,
  ContactType,
  Confidence,
  CreateContactInput,
} from '@/lib/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { X } from 'lucide-react';

const TYPES: ContactType[] = ['owner', 'manager', 'staff', 'general'];
const SOURCES: ContactSource[] = ['manual', 'website', 'directory', 'enrichment'];
const CONFIDENCES: Confidence[] = ['low', 'medium', 'high'];
const STATUSES: ContactStatus[] = ['unverified', 'verified', 'invalid'];

/**
 * Used for both create and edit. The dialog is intentionally simple — every
 * field directly maps to a Contact column. Validation lives on the API.
 */
export function ContactFormModal({
  open,
  initial,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial?: Partial<Contact>;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (input: CreateContactInput) => void;
}) {
  const [form, setForm] = useState<CreateContactInput>({
    name: '',
    contactType: 'general',
    source: 'manual',
    confidence: 'low',
    status: 'unverified',
    isPrimary: false,
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: initial?.name ?? '',
        contactType: initial?.contactType ?? 'general',
        email: initial?.email ?? '',
        phone: initial?.phone ?? '',
        linkedin: initial?.linkedin ?? '',
        socialProfile: initial?.socialProfile ?? '',
        source: initial?.source ?? 'manual',
        confidence: initial?.confidence ?? 'low',
        status: initial?.status ?? 'unverified',
        isPrimary: initial?.isPrimary ?? false,
        notes: initial?.notes ?? '',
      });
    }
  }, [open, initial]);

  if (!open) return null;

  const isEdit = !!initial?.id;
  const canSave = form.name.trim().length > 0 && !pending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-lg shadow-e3 w-full max-w-lg max-h-[90vh] overflow-auto">
        <header className="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <h2 className="text-h3">{isEdit ? 'Edit contact' : 'Add contact'}</h2>
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
            if (canSave) onSubmit({ ...form, name: form.name.trim() });
          }}
        >
          <Field label="Full name *">
            <Input
              autoFocus
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select
                value={form.contactType}
                onChange={(v) =>
                  setForm({ ...form, contactType: v as ContactType })
                }
                options={TYPES}
              />
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(v) =>
                  setForm({ ...form, status: v as ContactStatus })
                }
                options={STATUSES}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <Input
                type="email"
                value={form.email ?? ''}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="Phone">
              <Input
                value={form.phone ?? ''}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
          </div>
          <Field label="LinkedIn URL">
            <Input
              value={form.linkedin ?? ''}
              onChange={(e) => setForm({ ...form, linkedin: e.target.value })}
              placeholder="https://www.linkedin.com/in/..."
            />
          </Field>
          <Field label="Other social profile">
            <Input
              value={form.socialProfile ?? ''}
              onChange={(e) =>
                setForm({ ...form, socialProfile: e.target.value })
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Source">
              <Select
                value={form.source}
                onChange={(v) =>
                  setForm({ ...form, source: v as ContactSource })
                }
                options={SOURCES}
              />
            </Field>
            <Field label="Confidence">
              <Select
                value={form.confidence}
                onChange={(v) =>
                  setForm({ ...form, confidence: v as Confidence })
                }
                options={CONFIDENCES}
              />
            </Field>
          </div>
          <Field label="Notes">
            <textarea
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 text-bodysm rounded-md border border-border bg-surface placeholder:text-neutral focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 resize-none"
            />
          </Field>
          <label className="flex items-center gap-2 text-bodysm text-ink">
            <input
              type="checkbox"
              checked={form.isPrimary ?? false}
              onChange={(e) =>
                setForm({ ...form, isPrimary: e.target.checked })
              }
              className="accent-primary"
            />
            Mark as primary contact
          </label>
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
              {isEdit ? 'Save' : 'Add contact'}
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

function Select({
  value,
  onChange,
  options,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 px-2 w-full rounded-md border border-border bg-surface text-bodysm text-ink focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 capitalize"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o.replace('_', ' ')}
        </option>
      ))}
    </select>
  );
}
