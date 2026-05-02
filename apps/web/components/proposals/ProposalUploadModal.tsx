'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Proposal, SendProposalInput } from '@/lib/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import {
  AlertTriangle,
  FileText,
  Paperclip,
  Send,
  Upload,
  X,
} from 'lucide-react';

const MAX_PER_FILE = 10 * 1024 * 1024;
const MAX_TOTAL = 25 * 1024 * 1024;
const MAX_COUNT = 10;

/**
 * Phase 11 — proposal-upload modal. Used both from the chat-drawer slash
 * command and the lead-detail "+ Send proposal" button. Resolves the
 * recipient up-front (primary contact email > lead.email) so the user
 * sees who will get the email, and disables Send when nothing's
 * resolvable.
 */
export function ProposalUploadModal({
  open,
  leadId,
  accountId,
  onClose,
  onSent,
}: {
  open: boolean;
  leadId: string;
  /** Pre-selected EmailAccount; null falls back to server default. */
  accountId: string | null;
  onClose: () => void;
  /** Fired after a successful send so callers can toast / refetch. */
  onSent: (proposal: Proposal) => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const { data: lead } = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => api.getLead(leadId),
    enabled: !!leadId && open,
  });
  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts', leadId],
    queryFn: () => api.listContacts(leadId),
    enabled: !!leadId && open,
  });

  // Resolve recipient, preferring the primary contact's email and
  // falling back to lead.email.
  const recipient = useMemo<{ email: string; label: string } | null>(() => {
    const primary = contacts.find((c) => c.isPrimary && c.email);
    if (primary?.email) {
      return {
        email: primary.email,
        label: primary.name ? `${primary.name} · ${primary.email}` : primary.email,
      };
    }
    const anyContact = contacts.find((c) => c.email);
    if (anyContact?.email) {
      return {
        email: anyContact.email,
        label: anyContact.name
          ? `${anyContact.name} · ${anyContact.email}`
          : anyContact.email,
      };
    }
    if (lead?.email) {
      return { email: lead.email, label: `Lead · ${lead.email}` };
    }
    return null;
  }, [contacts, lead?.email]);

  // The contactId we'll forward — only when the recipient came from a
  // contact row (so the proposal links to the right contact).
  const recipientContactId = useMemo(() => {
    if (!recipient) return null;
    const match = contacts.find(
      (c) => c.email && c.email.toLowerCase() === recipient.email.toLowerCase(),
    );
    return match?.id ?? null;
  }, [contacts, recipient]);

  useEffect(() => {
    if (!open) return;
    setSubject('');
    setMessage('');
    setFiles([]);
    setFileError(null);
  }, [open, leadId]);

  // Default subject suggestion the user can override.
  const defaultSubject = lead?.businessName
    ? `Proposal — ${lead.businessName}`
    : 'Proposal';

  const send = useMutation({
    mutationFn: (input: SendProposalInput) => api.sendProposal(input),
    onSuccess: (proposal) => {
      qc.invalidateQueries({ queryKey: ['lead-proposals', leadId] });
      qc.invalidateQueries({ queryKey: ['email-history', leadId] });
      qc.invalidateQueries({ queryKey: ['lead', leadId] });
      qc.invalidateQueries({ queryKey: ['lead-tasks', leadId] });
      qc.invalidateQueries({ queryKey: ['tasks-list'] });
      qc.invalidateQueries({ queryKey: ['tasks-count-full'] });
      onSent(proposal);
    },
  });

  const addFiles = (incoming: File[]) => {
    setFileError(null);
    const merged: File[] = [...files];
    for (const f of incoming) {
      if (f.size > MAX_PER_FILE) {
        setFileError(`"${f.name}" is over the 10 MB per-file limit.`);
        continue;
      }
      if (merged.length >= MAX_COUNT) {
        setFileError(`You can attach at most ${MAX_COUNT} files.`);
        break;
      }
      merged.push(f);
    }
    const total = merged.reduce((s, f) => s + f.size, 0);
    if (total > MAX_TOTAL) {
      setFileError('Total attachment size exceeds 25 MB.');
      return;
    }
    setFiles(merged);
  };

  const removeFile = (idx: number) =>
    setFiles((prev) => prev.filter((_, i) => i !== idx));

  const onPickFiles = (list: FileList | null) => {
    if (!list) return;
    addFiles(Array.from(list));
    if (fileRef.current) fileRef.current.value = '';
  };

  if (!open) return null;

  const trimmedSubject = subject.trim();
  const trimmedMessage = message.trim();
  const canSend =
    !!recipient &&
    trimmedSubject.length > 0 &&
    trimmedMessage.length > 0 &&
    files.length > 0 &&
    !send.isPending;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-lg shadow-e3 w-full max-w-lg max-h-[92vh] overflow-auto">
        <header className="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-primary" />
            <h2 className="text-h3">Send proposal</h2>
          </div>
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
            if (!canSend || !recipient) return;
            send.mutate({
              leadId,
              contactId: recipientContactId ?? undefined,
              accountId: accountId ?? undefined,
              subject: trimmedSubject,
              message: trimmedMessage,
              files,
            });
          }}
        >
          <Field label="Recipient">
            {recipient ? (
              <div className="rounded-md border border-border bg-background px-3 h-10 flex items-center text-bodysm text-ink">
                <span className="truncate">{recipient.label}</span>
              </div>
            ) : (
              <div className="rounded-md border border-error/40 bg-error/5 p-3 flex gap-2 items-start">
                <AlertTriangle size={14} className="text-error mt-0.5 shrink-0" />
                <div className="text-bodysm text-error">
                  No resolvable email for this lead.
                  <div className="text-caption text-ink-muted mt-0.5">
                    Add a contact with an email, or set <code>lead.email</code>,
                    then try again.
                  </div>
                </div>
              </div>
            )}
          </Field>

          <Field label="Subject *">
            <Input
              autoFocus
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={defaultSubject}
              maxLength={998}
            />
          </Field>

          <Field label="Message *">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              placeholder={`Hi ${
                contacts.find((c) => c.isPrimary)?.name?.split(/\s+/)[0] ?? 'there'
              },\n\nAttached please find the proposal we discussed. Let me know if you have any questions.\n\nBest,`}
              className="w-full px-3 py-2 text-bodysm rounded-md border border-border bg-surface placeholder:text-neutral focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 resize-y"
            />
          </Field>

          <Field label="Attachments *">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                addFiles(Array.from(e.dataTransfer.files));
              }}
              onClick={() => fileRef.current?.click()}
              className={
                'rounded-md border-2 border-dashed p-4 cursor-pointer text-center transition ' +
                (isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary')
              }
            >
              <Upload size={18} className="text-neutral mx-auto mb-1" />
              <div className="text-bodysm text-ink">
                Drop PDFs here or <span className="text-primary">browse</span>
              </div>
              <div className="text-caption text-ink-muted mt-0.5">
                Up to {MAX_COUNT} files · 10 MB each · 25 MB total
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              multiple
              onChange={(e) => onPickFiles(e.target.files)}
              className="hidden"
            />
            {files.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {files.map((f, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 text-caption px-2 py-1 rounded-md bg-background border border-border"
                    title={f.name}
                  >
                    <Paperclip size={11} className="text-neutral" />
                    <span className="truncate max-w-[200px]">{f.name}</span>
                    <span className="text-neutral font-mono">
                      {formatBytes(f.size)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(idx);
                      }}
                      className="text-neutral hover:text-error"
                      aria-label={`Remove ${f.name}`}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {fileError && (
              <div className="text-caption text-error mt-1">{fileError}</div>
            )}
          </Field>

          {send.error && (
            <div
              className="text-caption text-error truncate"
              title={(send.error as Error).message}
            >
              {(send.error as Error).message}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={send.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSend}>
              <Send size={13} /> Send proposal
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
