'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  CreateTemplateInput,
  EmailTemplate,
} from '@/lib/api';
import {
  SUPPORTED_TAGS,
} from '@/lib/campaigns';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { X } from 'lucide-react';
import { TemplatePreview } from './TemplatePreview';

type ContentTab = 'text' | 'html';

/**
 * Create / edit a template with separate text & HTML editors and a live
 * responsive preview (desktop / phone). Both bodies are saved on the
 * template — the campaign tick will prefer HTML when present and fall
 * back to text. The HTML preview renders the user's own raw HTML in an
 * iframe-like container; we already trust the author (this is internal
 * tooling, no external untrusted input).
 */
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

  const [contentTab, setContentTab] = useState<ContentTab>('text');

  useEffect(() => {
    if (!open) return;
    setForm({
      name: initial?.name ?? '',
      description: initial?.description ?? '',
      subject: initial?.subject ?? '',
      bodyText: initial?.bodyText ?? '',
      bodyHtml: initial?.bodyHtml ?? '',
    });
    // Default to HTML view if the template already has HTML content.
    setContentTab(initial?.bodyHtml ? 'html' : 'text');
  }, [open, initial]);

  if (!open) return null;
  const isEdit = !!initial?.id;
  const canSave =
    form.name.trim().length > 0 &&
    form.subject.trim().length > 0 &&
    form.bodyText.trim().length > 0 &&
    !pending;

  const hasHtml = (form.bodyHtml ?? '').trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-lg shadow-e3 w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
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
                bodyHtml: hasHtml ? form.bodyHtml : undefined,
              });
            }
          }}
        >
          {/* ─── Editor side ─── */}
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

            {/* Content tabs: Text | HTML */}
            <div>
              <div className="flex items-center gap-2 border-b border-border mb-2">
                <TabButton
                  active={contentTab === 'text'}
                  onClick={() => setContentTab('text')}
                >
                  Text body *
                </TabButton>
                <TabButton
                  active={contentTab === 'html'}
                  onClick={() => setContentTab('html')}
                >
                  HTML body
                  <span className="ml-1.5 text-[10px] text-neutral font-normal">
                    {hasHtml ? '(set)' : '(optional)'}
                  </span>
                </TabButton>
              </div>

              {contentTab === 'text' ? (
                <textarea
                  value={form.bodyText}
                  onChange={(e) => setForm({ ...form, bodyText: e.target.value })}
                  rows={14}
                  required
                  placeholder={'Hi {{firstName}},\n\nI noticed {{businessName}} ...'}
                  className="w-full px-3 py-2 text-bodysm rounded-md border border-border bg-surface placeholder:text-neutral focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 resize-y font-mono"
                />
              ) : (
                <>
                  <textarea
                    value={form.bodyHtml ?? ''}
                    onChange={(e) => setForm({ ...form, bodyHtml: e.target.value })}
                    rows={14}
                    placeholder={
                      '<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#050F1A">\n  <p>Hi {{firstName}},</p>\n  <p>I noticed {{businessName}} ...</p>\n</div>'
                    }
                    className="w-full px-3 py-2 text-bodysm rounded-md border border-border bg-surface placeholder:text-neutral focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 resize-y font-mono"
                  />
                  <div className="text-caption text-ink-muted mt-1">
                    Optional. When present, this is what most clients render
                    (Gmail, Outlook, Apple Mail). The text body is a fallback
                    for plain-text-only readers.
                  </div>
                </>
              )}
            </div>

            <details className="text-bodysm">
              <summary className="cursor-pointer text-neutral hover:text-ink">
                Available merge tags
              </summary>
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

          {/* ─── Preview side ─── */}
          <div className="p-5 bg-background flex flex-col min-h-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="text-caption uppercase tracking-wider text-neutral">
                Live preview
              </div>
              <span className="text-caption text-ink-muted">
                · sample lead "Acme Plumbing"
              </span>
            </div>
            <TemplatePreview
              subject={form.subject}
              bodyText={form.bodyText}
              bodyHtml={form.bodyHtml ?? ''}
              contentTabOverride={contentTab}
              onContentTabChange={setContentTab}
              className="flex-1 min-h-[420px]"
            />
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

function TabButton({
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
      className={clsx(
        'h-9 px-3 text-bodysm font-medium border-b-2 -mb-px',
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-ink-muted hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

