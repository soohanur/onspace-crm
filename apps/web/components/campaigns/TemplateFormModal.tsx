'use client';

import { useEffect, useState } from 'react';
import {
  CreateTemplateInput,
  EmailTemplate,
} from '@/lib/api';
import {
  SAMPLE_PREVIEW_CONTEXT,
  SUPPORTED_TAGS,
  previewRender,
} from '@/lib/campaigns';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { X } from 'lucide-react';

/** Create/edit a template with live preview. */
export function TemplateFormModal({
  open,
  initial,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial?: Partial<EmailTemplate>;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (input: CreateTemplateInput) => void;
}) {
  const [form, setForm] = useState<CreateTemplateInput>({
    name: '',
    description: '',
    subject: '',
    bodyText: '',
    bodyHtml: '',
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      name: initial?.name ?? '',
      description: initial?.description ?? '',
      subject: initial?.subject ?? '',
      bodyText: initial?.bodyText ?? '',
      bodyHtml: initial?.bodyHtml ?? '',
    });
  }, [open, initial]);

  if (!open) return null;
  const isEdit = !!initial?.id;
  const canSave =
    form.name.trim().length > 0 &&
    form.subject.trim().length > 0 &&
    form.bodyText.trim().length > 0 &&
    !pending;

  const previewSubject = previewRender(form.subject, SAMPLE_PREVIEW_CONTEXT);
  const previewBody = previewRender(form.bodyText, SAMPLE_PREVIEW_CONTEXT);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-lg shadow-e3 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <header className="px-5 py-3.5 border-b border-border flex items-center justify-between shrink-0">
          <h2 className="text-h3">{isEdit ? 'Edit template' : 'New template'}</h2>
          <button
            onClick={onClose}
            className="text-neutral hover:text-error"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>
        <form
          className="flex-1 overflow-auto grid grid-cols-1 lg:grid-cols-[1fr_1fr]"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) {
              onSubmit({
                ...form,
                name: form.name.trim(),
                description: form.description?.trim() || undefined,
              });
            }
          }}
        >
          <div className="p-5 space-y-3 border-r border-border">
            <Field label="Name *">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
                required
              />
            </Field>
            <Field label="Description">
              <Input
                value={form.description ?? ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
            <Field label="Subject *">
              <Input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                required
                placeholder="Quick question for {{businessName}}"
              />
            </Field>
            <Field label="Body (text) *">
              <textarea
                value={form.bodyText}
                onChange={(e) => setForm({ ...form, bodyText: e.target.value })}
                rows={10}
                required
                placeholder={`Hi {{firstName}},\n\nI noticed {{businessName}} ...`}
                className="w-full px-3 py-2 text-bodysm rounded-md border border-border bg-surface placeholder:text-neutral focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 resize-none font-mono"
              />
            </Field>
            <details className="text-bodysm">
              <summary className="cursor-pointer text-neutral hover:text-ink">Available merge tags</summary>
              <ul className="mt-2 space-y-1">
                {SUPPORTED_TAGS.map((t) => (
                  <li key={t.tag} className="flex items-baseline gap-2">
                    <code className="text-primary font-mono text-[12px]">{`{{${t.tag}}}`}</code>
                    <span className="text-caption text-ink-muted">{t.description}</span>
                    {t.required && (
                      <span className="text-[11px] text-error font-medium">(required)</span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
            {error && (
              <div className="text-caption text-error" title={error}>
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
                {isEdit ? 'Save' : 'Create template'}
              </Button>
            </div>
          </div>
          <div className="p-5 space-y-3 bg-background">
            <div className="text-caption uppercase tracking-wider text-neutral">
              Live preview (sample lead)
            </div>
            <div className="rounded-md border border-border bg-surface p-4">
              <div className="text-caption text-neutral mb-1">Subject</div>
              <div className="font-medium text-ink mb-3">{previewSubject || '(empty)'}</div>
              <div className="text-caption text-neutral mb-1">Body</div>
              <pre className="whitespace-pre-wrap text-bodysm font-sans text-ink">
                {previewBody || '(empty)'}
              </pre>
            </div>
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
