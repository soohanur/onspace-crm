'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, EmailLog, Lead } from '@/lib/api';
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

  // close on Escape
  useEffect(() => {
    if (!emailId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !replyOpen) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [emailId, replyOpen, onClose]);

  if (!emailId) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <aside className="fixed top-0 right-0 z-50 h-full w-full max-w-[640px] bg-surface shadow-e3 flex flex-col">
        <header className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Mail size={16} className="text-primary shrink-0" />
            <div className="min-w-0">
              <div className="font-medium truncate">
                {email?.subject ?? 'Loading…'}
              </div>
              <div className="text-caption text-ink-muted truncate">
                {email?.fromEmail} → {email?.toEmail}
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
              {/* Status strip */}
              <div className="px-5 py-3 border-b border-border bg-background space-y-1.5">
                <div className="flex flex-wrap items-center gap-3 text-bodysm">
                  <StatusChip status={email.status} />
                  <span className="ml-auto text-caption text-neutral font-mono font-tabular">
                    sent {new Date(email.sentAt ?? email.createdAt).toLocaleString()}
                  </span>
                </div>
                {/* Always shows the open status — exact time when opened, "Not opened yet" otherwise. */}
                <div className="text-bodysm">
                  <OpenedIndicator openedAt={email.openedAt} size="md" />
                </div>
                <div className="text-bodysm">
                  {email.repliedAt ? (
                    <span className="inline-flex items-center gap-1 text-success">
                      <Reply size={13} />
                      <span className="font-medium">Replied</span>
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

              {/* Headers */}
              <section className="px-5 py-4 border-b border-border space-y-1.5 text-bodysm">
                <Row label="From">
                  <span className="font-mono">
                    {email.fromName
                      ? `${email.fromName} <${email.fromEmail}>`
                      : email.fromEmail}
                  </span>
                </Row>
                <Row label="To">
                  <span className="font-mono">{email.toEmail}</span>
                </Row>
                {email.cc.length > 0 && (
                  <Row label="Cc">
                    <span className="font-mono">{email.cc.join(', ')}</span>
                  </Row>
                )}
                {email.bcc.length > 0 && (
                  <Row label="Bcc">
                    <span className="font-mono">{email.bcc.join(', ')}</span>
                  </Row>
                )}
                <Row label="Subject">{email.subject}</Row>
              </section>

              {/* Body */}
              <section className="px-5 py-4 border-b border-border">
                <BodyRender email={email} />
              </section>

              {/* Attachments */}
              {email.attachments.length > 0 && (
                <section className="px-5 py-4 border-b border-border">
                  <div className="text-caption uppercase tracking-wider text-neutral mb-2 inline-flex items-center gap-1.5">
                    <Paperclip size={12} /> Attachments ({email.attachments.length})
                  </div>
                  <div className="space-y-1">
                    {email.attachments.map((a) => (
                      <a
                        key={a.filename}
                        href={api.attachmentDownloadUrl(email.id, a.filename)}
                        className="flex items-center gap-2 px-3 py-2 rounded-md border border-border hover:border-primary hover:text-primary text-bodysm"
                      >
                        <Paperclip size={13} className="text-neutral" />
                        <span className="flex-1 truncate">{a.filename}</span>
                        <span className="text-caption text-neutral font-mono">
                          {formatBytes(a.size)}
                        </span>
                        <Download size={12} className="text-neutral" />
                      </a>
                    ))}
                  </div>
                </section>
              )}

              {/* Replies */}
              <section className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-caption uppercase tracking-wider text-neutral inline-flex items-center gap-1.5">
                    <Reply size={12} /> Replies ({email.replies?.length ?? 0})
                  </div>
                  <button
                    onClick={() => refresh.mutate()}
                    disabled={refresh.isPending}
                    className="text-caption text-ink-muted hover:text-primary inline-flex items-center gap-1"
                  >
                    <RefreshCw
                      size={11}
                      className={refresh.isPending ? 'animate-spin' : ''}
                    />
                    {refresh.isPending ? 'Checking…' : 'Check for replies'}
                  </button>
                </div>

                {refresh.error && (
                  <div className="mb-3 rounded-md border border-error/40 bg-errorBg p-3 text-bodysm flex items-start gap-2">
                    <AlertCircle size={14} className="text-error shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="font-medium text-ink">Couldn't fetch replies</div>
                      <div className="text-caption text-ink-muted mt-0.5">
                        {(refresh.error as Error).message}
                      </div>
                    </div>
                  </div>
                )}

                {refresh.data && refresh.data.newReplies === 0 && !refresh.error && (
                  <div className="mb-3 text-caption text-ink-muted">
                    Checked {new Date().toLocaleTimeString()} — no new replies.
                  </div>
                )}

                {!email.replies || email.replies.length === 0 ? (
                  <div className="text-bodysm text-ink-muted py-6 text-center border border-dashed border-border rounded-md">
                    No replies yet. The poller checks Gmail every couple of minutes,
                    or click <span className="font-medium text-ink">Check for replies</span> above.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {email.replies.map((r) => (
                      <ReplyBubble key={r.id} reply={r} />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-border flex items-center justify-between">
          {email?.error && (
            <div className="text-error text-caption truncate" title={email.error}>
              {email.error}
            </div>
          )}
          <div className="ml-auto flex gap-2">
            <Button onClick={() => setReplyOpen(true)} disabled={!email}>
              <Reply size={14} /> Reply
            </Button>
          </div>
        </footer>
      </aside>

      {/* Reply dialog reuses SendEmailDialog with replyTo */}
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[60px_1fr] gap-2">
      <dt className="text-caption uppercase tracking-wider text-neutral">{label}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
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

function Indicator({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
}) {
  if (value) {
    return (
      <span className="text-success text-caption inline-flex items-center gap-1">
        {icon} {label} {new Date(value).toLocaleString()}
      </span>
    );
  }
  return (
    <span className="text-neutral/70 text-caption inline-flex items-center gap-1">
      {icon} {label} —
    </span>
  );
}

function BodyRender({ email }: { email: EmailLog }) {
  // Strip our own tracking pixel from rendering — recipient saw it but UI shouldn't.
  const html = (email.bodyHtml ?? '').replace(
    /<img[^>]*src="[^"]*\/api\/email\/track\/[^"]*"[^>]*>/gi,
    '',
  );
  if (html) {
    return (
      <div
        className="text-bodysm leading-relaxed prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return (
    <pre className="text-bodysm whitespace-pre-wrap font-sans leading-relaxed">
      {email.bodyText ?? '(no body)'}
    </pre>
  );
}

function ReplyBubble({
  reply,
}: {
  reply: NonNullable<EmailLog['replies']>[number];
}) {
  return (
    <article className="rounded-md border border-border p-3 bg-background">
      <header className="flex items-center justify-between gap-2 mb-1.5">
        <div className="text-bodysm font-medium truncate">
          {reply.fromName ? (
            <>
              {reply.fromName}{' '}
              <span className="text-neutral font-normal">
                &lt;{reply.fromEmail}&gt;
              </span>
            </>
          ) : (
            reply.fromEmail
          )}
        </div>
        <div className="text-caption text-neutral font-mono font-tabular shrink-0">
          {new Date(reply.receivedAt).toLocaleString()}
        </div>
      </header>
      {reply.bodyHtml ? (
        <div
          className="text-bodysm leading-relaxed prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: reply.bodyHtml }}
        />
      ) : (
        <pre className="text-bodysm whitespace-pre-wrap font-sans leading-relaxed">
          {reply.bodyText ?? reply.snippet ?? '(no body)'}
        </pre>
      )}
    </article>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
