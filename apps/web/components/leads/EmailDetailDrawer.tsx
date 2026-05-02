'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, EmailLog, Lead, ThreadMessage } from '@/lib/api';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { SendEmailDialog } from './SendEmailDialog';
import { OpenedIndicator } from './OpenedIndicator';
import {
  X,
  Mail,
  Reply,
  RefreshCw,
  Paperclip,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
} from 'lucide-react';

/**
 * Conversation-style email detail. Shows the entire thread (every send
 * we've made + every reply we've received) in chronological order with
 * outbound (us) on the right and inbound (them) on the left, like iMessage
 * or Gmail's conversation view.
 */
export function EmailDetailDrawer({
  lead,
  emailId,
  onClose,
}: {
  lead: Lead;
  emailId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [replyOpen, setReplyOpen] = useState(false);

  const { data: email, isLoading } = useQuery({
    queryKey: ['email', emailId],
    queryFn: () => api.getEmail(emailId!),
    enabled: !!emailId,
    refetchInterval: emailId ? 5_000 : false,
  });

  const refresh = useMutation({
    mutationFn: () => api.refreshEmailReplies(emailId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email', emailId] });
      qc.invalidateQueries({ queryKey: ['email-history', lead.id] });
    },
  });

  useEffect(() => {
    if (!emailId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !replyOpen) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [emailId, replyOpen, onClose]);

  if (!emailId) return null;

  const messages = email?.messages ?? [];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <aside className="fixed top-0 right-0 z-50 h-full w-full max-w-[720px] bg-surface shadow-e3 flex flex-col">
        <header className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Mail size={16} className="text-primary shrink-0" />
            <div className="min-w-0">
              <div className="font-medium truncate">
                {email?.subject ?? 'Loading…'}
              </div>
              <div className="text-caption text-ink-muted truncate">
                {messages.length > 0
                  ? `${messages.length} message${messages.length === 1 ? '' : 's'} in this thread`
                  : email
                  ? `${email.fromEmail} → ${email.toEmail}`
                  : ''}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral hover:text-ink shrink-0"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto scroll-thin">
          {isLoading || !email ? (
            <div className="p-8 text-ink-muted text-bodysm">Loading email…</div>
          ) : (
            <>
              {/* Status strip — anchored to the FIRST outbound message (the tracked one) */}
              <div className="px-5 py-3 border-b border-border bg-background space-y-1.5">
                <div className="flex flex-wrap items-center gap-3 text-bodysm">
                  <StatusChip status={email.status} />
                  <span className="ml-auto text-caption text-neutral font-mono font-tabular">
                    started {new Date(email.sentAt ?? email.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="text-bodysm">
                  <OpenedIndicator openedAt={email.openedAt} size="md" />
                </div>
                <div className="text-bodysm">
                  {email.repliedAt ? (
                    <span className="inline-flex items-center gap-1 text-success">
                      <Reply size={13} />
                      <span className="font-medium">Last reply</span>
                      <span className="font-mono font-tabular">
                        {new Date(email.repliedAt).toLocaleString()}
                      </span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-neutral">
                      <Reply size={13} />
                      <span>No reply yet</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Refresh row */}
              <div className="px-5 py-2 border-b border-border flex items-center justify-between text-caption">
                <span className="text-ink-muted">
                  {refresh.data && refresh.data.newReplies === 0 && !refresh.error
                    ? `Last checked ${new Date().toLocaleTimeString()} — no new replies.`
                    : ''}
                </span>
                <button
                  onClick={() => refresh.mutate()}
                  disabled={refresh.isPending}
                  className="text-ink-muted hover:text-primary inline-flex items-center gap-1"
                >
                  <RefreshCw
                    size={11}
                    className={refresh.isPending ? 'animate-spin' : ''}
                  />
                  {refresh.isPending ? 'Checking…' : 'Check for replies'}
                </button>
              </div>

              {refresh.error && (
                <div className="mx-5 my-3 rounded-md border border-error/40 bg-errorBg p-3 text-bodysm flex items-start gap-2">
                  <AlertCircle size={14} className="text-error shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-medium text-ink">Couldn't fetch replies</div>
                    <div className="text-caption text-ink-muted mt-0.5">
                      {(refresh.error as Error).message}
                    </div>
                  </div>
                </div>
              )}

              {/* Conversation */}
              <section className="px-5 py-5 space-y-4">
                {messages.length === 0 ? (
                  <div className="py-8 text-center text-ink-muted text-bodysm border border-dashed border-border rounded-md">
                    No messages.
                  </div>
                ) : (
                  messages.map((m) => (
                    <MessageBubble key={`${m.type}:${m.id}`} message={m} email={email} />
                  ))
                )}
              </section>
            </>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <Button onClick={() => setReplyOpen(true)} disabled={!email}>
            <Reply size={14} /> Reply
          </Button>
        </footer>
      </aside>

      {email && (
        <SendEmailDialog
          lead={lead}
          open={replyOpen}
          onClose={() => setReplyOpen(false)}
          replyTo={email}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Bubble
// ─────────────────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  email,
}: {
  message: ThreadMessage;
  email: EmailLog;
}) {
  const isOutbound = message.direction === 'outbound';
  const html = (message.bodyHtml ?? '').replace(
    /<img[^>]*src="[^"]*\/api\/email\/track\/[^"]*"[^>]*>/gi,
    '',
  );
  const text = message.bodyText ?? message.snippet ?? '';

  return (
    <article
      className={
        'flex flex-col gap-1 ' +
        (isOutbound ? 'items-end' : 'items-start')
      }
    >
      <div className="flex items-baseline gap-2 text-caption text-ink-muted px-1">
        <span className="font-medium text-ink">
          {isOutbound
            ? message.fromName
              ? `${message.fromName} (you)`
              : 'You'
            : message.fromName ?? message.fromEmail}
        </span>
        <span className="text-neutral font-mono font-tabular">
          {new Date(message.timestamp).toLocaleString()}
        </span>
        {message.type === 'log' && message.status === 'failed' && (
          <Chip tone="negative" className="!h-5 !text-[11px]">failed</Chip>
        )}
        {message.type === 'log' && message.status === 'sending' && (
          <Chip tone="primary" className="!h-5 !text-[11px]">sending</Chip>
        )}
      </div>

      <div
        className={
          'max-w-[85%] rounded-lg px-4 py-3 text-bodysm leading-relaxed border ' +
          (isOutbound
            ? 'bg-primary/8 border-primary/20'
            : 'bg-background border-border')
        }
      >
        {html ? (
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="whitespace-pre-wrap font-sans">{text || '(no body)'}</pre>
        )}

        {message.attachments.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border space-y-1">
            {message.attachments.map((a) => (
              <a
                key={a.filename}
                href={api.attachmentDownloadUrl(message.id, a.filename)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-surface border border-border hover:border-primary hover:text-primary text-caption"
              >
                <Paperclip size={11} className="text-neutral" />
                <span className="flex-1 truncate">{a.filename}</span>
                <span className="text-neutral font-mono">{formatBytes(a.size)}</span>
                <Download size={11} className="text-neutral" />
              </a>
            ))}
          </div>
        )}

        {/* Open status only on the FIRST outbound (only it has the tracking pixel). */}
        {message.type === 'log' && message.id === email.id && (
          <div className="mt-2 pt-2 border-t border-border text-caption">
            <OpenedIndicator openedAt={message.openedAt ?? null} />
          </div>
        )}

        {message.type === 'log' && message.error && (
          <div className="mt-2 text-caption text-error truncate" title={message.error}>
            {message.error}
          </div>
        )}
      </div>
    </article>
  );
}

function StatusChip({ status }: { status: EmailLog['status'] }) {
  if (status === 'sent') {
    return (
      <Chip tone="positive">
        <CheckCircle2 size={11} className="mr-1" /> sent
      </Chip>
    );
  }
  if (status === 'failed') {
    return (
      <Chip tone="negative">
        <XCircle size={11} className="mr-1" /> failed
      </Chip>
    );
  }
  if (status === 'sending') {
    return (
      <Chip tone="primary">
        <Clock size={11} className="mr-1 animate-spin" /> sending
      </Chip>
    );
  }
  return <Chip tone="neutral">{status}</Chip>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
