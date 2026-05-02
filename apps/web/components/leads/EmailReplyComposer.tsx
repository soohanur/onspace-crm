'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, EmailLog, Lead } from '@/lib/api';
import { Send, Paperclip, X, Loader2 } from 'lucide-react';

const MAX_PER_FILE = 25 * 1024 * 1024;

/**
 * WhatsApp-style inline composer pinned to the bottom of the email drawer.
 * Sends as a reply continuing the parent thread. No modal.
 */
export function EmailReplyComposer({
  lead,
  parent,
}: {
  lead: Lead;
  parent: EmailLog;
}) {
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: api.listEmailAccounts,
  });
  // Use the same account that sent the parent if still active; otherwise default.
  const accountId =
    accounts.find((a) => a.id === parent.accountId)?.id ?? accounts[0]?.id;

  // Recipient = whoever wrote the most recent reply in the thread, fallback
  // to the original parent's toEmail (= the client).
  const lastReply = parent.messages?.filter((m) => m.direction === 'inbound').slice(-1)[0];
  const toEmail = lastReply?.fromEmail ?? parent.toEmail;
  const subject = parent.subject?.toLowerCase().startsWith('re:')
    ? parent.subject
    : `Re: ${parent.subject}`;

  const send = useMutation({
    mutationFn: () =>
      api.sendEmail({
        leadId: lead.id,
        accountId,
        toEmail,
        subject,
        body,
        files,
        replyToLogId: parent.id,
      }),
    onSuccess: () => {
      setBody('');
      setFiles([]);
      qc.invalidateQueries({ queryKey: ['email', parent.id] });
      qc.invalidateQueries({ queryKey: ['email-history', lead.id] });
    },
  });

  const onFiles = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list);
    const ok = arr.filter((f) => f.size <= MAX_PER_FILE);
    setFiles((prev) => [...prev, ...ok]);
    if (fileRef.current) fileRef.current.value = '';
  };
  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const canSend = body.trim().length > 0 && !!accountId && !send.isPending;
  const noAccounts = accounts.length === 0;

  if (noAccounts) {
    return (
      <div className="px-5 py-3 border-t border-border text-bodysm text-ink-muted bg-background">
        Connect a Gmail account in <span className="font-medium text-ink">Settings</span> to reply.
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-surface">
      {/* file chips */}
      {files.length > 0 && (
        <div className="px-4 pt-3 flex flex-wrap gap-1.5">
          {files.map((f, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 text-caption px-2 py-1 rounded-md bg-background border border-border"
              title={f.name}
            >
              <Paperclip size={11} className="text-neutral" />
              <span className="truncate max-w-[200px]">{f.name}</span>
              <button
                onClick={() => removeFile(idx)}
                className="text-neutral hover:text-error"
                aria-label="Remove"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      {send.error && (
        <div className="px-4 pt-2 text-caption text-error truncate" title={(send.error as Error).message}>
          {(send.error as Error).message}
        </div>
      )}
      <div className="px-3 py-2 flex items-end gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="h-10 w-10 rounded-md text-neutral hover:text-primary hover:bg-background flex items-center justify-center shrink-0"
          aria-label="Attach files"
          title="Attach files"
        >
          <Paperclip size={16} />
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          onChange={(e) => onFiles(e.target.files)}
          className="hidden"
        />
        <textarea
          rows={1}
          placeholder={`Reply to ${toEmail}…`}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            // auto-grow up to 6 lines
            e.currentTarget.style.height = 'auto';
            e.currentTarget.style.height =
              Math.min(e.currentTarget.scrollHeight, 160) + 'px';
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSend) {
              e.preventDefault();
              send.mutate();
            }
          }}
          className="flex-1 min-h-[40px] max-h-[160px] px-3 py-2 text-bodysm rounded-md border border-border bg-surface placeholder:text-neutral focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 resize-none transition"
        />
        <button
          type="button"
          onClick={() => canSend && send.mutate()}
          disabled={!canSend}
          className="h-10 w-10 rounded-md bg-primary text-white hover:bg-primary-hover disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center shrink-0"
          aria-label="Send reply"
          title="Send reply (⌘/Ctrl + Enter)"
        >
          {send.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
      <div className="px-4 pb-2 text-caption text-neutral">
        Replying to <span className="font-mono">{toEmail}</span> ·{' '}
        <span className="text-ink">{subject}</span>
      </div>
    </div>
  );
}
