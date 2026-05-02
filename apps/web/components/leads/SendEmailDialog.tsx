'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, EmailLog, Lead } from '@/lib/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { X, Mail, Send, AlertCircle, Paperclip, Trash2, Reply } from 'lucide-react';
import Link from 'next/link';

const MAX_PER_FILE = 25 * 1024 * 1024; // 25 MB Gmail attachment limit (per file in our wrapper)

export function SendEmailDialog({
  lead,
  open,
  onClose,
  replyTo,
}: {
  lead: Lead;
  open: boolean;
  onClose: () => void;
  /** When set, pre-fill as a reply continuing this email's thread. */
  replyTo?: EmailLog;
}) {
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState<string | undefined>(undefined);
  const [recipient, setRecipient] = useState<string>('');
  const [customRecipient, setCustomRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: api.listEmailAccounts,
    enabled: open,
  });

  const knownEmails =
    lead.emails.length > 0 ? lead.emails : lead.email ? [lead.email] : [];
  const recipientChoice = recipient === '__custom' ? '__custom' : recipient;

  // Reset / pre-fill on open.
  useEffect(() => {
    if (!open) return;
    setFiles([]);
    if (replyTo) {
      // Reply mode — recipient is whoever wrote the most recent reply (or original to)
      const lastReply = replyTo.replies?.[replyTo.replies.length - 1];
      const replyTarget = lastReply?.fromEmail ?? replyTo.toEmail;
      setRecipient(knownEmails.includes(replyTarget) ? replyTarget : '__custom');
      setCustomRecipient(knownEmails.includes(replyTarget) ? '' : replyTarget);
      setSubject(
        replyTo.subject.toLowerCase().startsWith('re:')
          ? replyTo.subject
          : `Re: ${replyTo.subject}`,
      );
      const quoted = (replyTo.bodyText ?? '')
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n');
      setBody(`\n\n---\nOn ${new Date(replyTo.sentAt ?? replyTo.createdAt).toLocaleString()} ${replyTo.fromEmail} wrote:\n${quoted}`);
      setAccountId(replyTo.accountId ?? undefined);
    } else {
      setRecipient(knownEmails[0] ?? '__custom');
      setCustomRecipient('');
      setSubject('');
      setBody('');
      setAccountId(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, replyTo?.id]);

  const send = useMutation({
    mutationFn: () => {
      const toEmail =
        recipientChoice === '__custom' ? customRecipient.trim() : recipientChoice;
      return api.sendEmail({
        leadId: lead.id,
        accountId,
        toEmail,
        subject: subject.trim(),
        body,
        files,
        replyToLogId: replyTo?.id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-history', lead.id] });
      if (replyTo) qc.invalidateQueries({ queryKey: ['email', replyTo.id] });
      onClose();
    },
  });

  const onFilesChosen = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list);
    const tooBig = arr.filter((f) => f.size > MAX_PER_FILE);
    if (tooBig.length > 0) {
      alert(
        `These files exceed 25 MB and were skipped:\n${tooBig.map((f) => `· ${f.name}`).join('\n')}`,
      );
    }
    const ok = arr.filter((f) => f.size <= MAX_PER_FILE);
    setFiles((prev) => [...prev, ...ok]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const toEmail =
    recipientChoice === '__custom' ? customRecipient.trim() : recipientChoice;
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail);
  const canSend =
    validEmail && subject.trim() && body.trim() && !send.isPending && accounts.length > 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-surface rounded-lg shadow-e3 w-full max-w-[640px] max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            {replyTo ? (
              <Reply size={16} className="text-primary" />
            ) : (
              <Mail size={16} className="text-primary" />
            )}
            <h3 className="text-h3">
              {replyTo ? 'Reply' : 'Send email'} · {lead.businessName}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-neutral hover:text-ink"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {accounts.length === 0 ? (
            <div className="rounded-md border border-warning/40 bg-[#FEF4E5] p-3 text-bodysm flex items-start gap-2">
              <AlertCircle size={16} className="text-warning shrink-0 mt-0.5" />
              <div>
                You haven't connected a Gmail account yet.{' '}
                <Link href="/settings" className="text-primary hover:underline">
                  Connect one in Settings
                </Link>{' '}
                first.
              </div>
            </div>
          ) : (
            <>
              <Field label="From">
                <select
                  value={accountId ?? accounts[0]?.id}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="h-11 w-full px-3.5 rounded-md border border-border bg-surface text-[15px] focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.displayName ? `${a.displayName} <${a.email}>` : a.email}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="To">
                <select
                  value={recipientChoice}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="h-11 w-full px-3.5 rounded-md border border-border bg-surface text-[15px] focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                >
                  {knownEmails.map((em) => (
                    <option key={em} value={em}>
                      {em}
                    </option>
                  ))}
                  <option value="__custom">Custom email…</option>
                </select>
                {recipientChoice === '__custom' && (
                  <Input
                    type="email"
                    placeholder="someone@example.com"
                    value={customRecipient}
                    onChange={(e) => setCustomRecipient(e.target.value)}
                    className="mt-2"
                  />
                )}
              </Field>

              <Field label="Subject">
                <Input
                  placeholder="Quick question about your services"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </Field>

              <Field label="Message">
                <textarea
                  rows={9}
                  placeholder="Hi there, I came across your business on YellowPages…"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full text-bodysm rounded-md border border-border bg-surface p-3 placeholder:text-neutral focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition resize-y"
                />
              </Field>

              {/* Attachments */}
              <Field label={`Attachments${files.length ? ` (${files.length})` : ''}`}>
                <div className="space-y-2">
                  {files.length > 0 && (
                    <div className="space-y-1">
                      {files.map((f, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-background text-bodysm"
                        >
                          <Paperclip size={13} className="text-neutral shrink-0" />
                          <span className="flex-1 truncate" title={f.name}>
                            {f.name}
                          </span>
                          <span className="text-caption text-neutral font-mono shrink-0">
                            {formatBytes(f.size)}
                          </span>
                          <button
                            onClick={() => removeFile(idx)}
                            className="text-neutral hover:text-error shrink-0"
                            aria-label="Remove"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={(e) => onFilesChosen(e.target.files)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-bodysm text-primary hover:underline inline-flex items-center gap-1.5"
                  >
                    <Paperclip size={13} /> Attach files
                  </button>
                </div>
              </Field>

              {send.error && (
                <div className="text-error text-bodysm">
                  {(send.error as Error).message}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => send.mutate()} disabled={!canSend}>
            <Send size={14} /> {send.isPending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-caption uppercase tracking-wider text-neutral mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
