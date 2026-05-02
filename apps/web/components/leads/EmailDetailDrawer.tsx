'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, EmailLog, Lead, ThreadMessage } from '@/lib/api';
import { Chip } from '../ui/Chip';
import { OpenedIndicator } from './OpenedIndicator';
import { EmailReplyComposer } from './EmailReplyComposer';
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
  Check,
  CheckCheck,
} from 'lucide-react';

/**
 * WhatsApp-style conversation drawer.
 *
 * Behaviour:
 *  - Outbound (us) bubbles right-aligned, primary tinted.
 *  - Inbound (them) bubbles left-aligned, neutral.
 *  - Outbound bubbles render WhatsApp ticks under the timestamp:
 *      sending  → single grey ✓
 *      sent     → grey ✓✓
 *      opened   → green ✓✓ + "Read {time}"
 *      failed   → red !
 *  - Drawer auto-refreshes replies on open and every 20 s while open.
 *    Detail also refetches every 2 s so opens / replies surface fast.
 *  - Inline composer at the bottom (no popup) — cmd/ctrl + enter to send.
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

  // Portal mounts only after hydration so SSR doesn't try to touch document.
  // Without the portal, the drawer is constrained by an ancestor's stacking
  // context (Shell's flex layout) and ends up below the topbar.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data: email, isLoading } = useQuery({
    queryKey: ['email', emailId],
    queryFn: () => api.getEmail(emailId!),
    enabled: !!emailId,
    refetchInterval: emailId ? 2_000 : false,
  });

  const refresh = useMutation({
    mutationFn: () => api.refreshEmailReplies(emailId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email', emailId] });
      qc.invalidateQueries({ queryKey: ['email-history', lead.id] });
    },
  });

  // Auto-refresh: once on open, then every 20 s while drawer is mounted.
  useEffect(() => {
    if (!emailId) return;
    refresh.mutate();
    const t = setInterval(() => {
      // skip if still in flight
      if (!refresh.isPending) refresh.mutate();
    }, 20_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailId]);

  // Esc to close
  useEffect(() => {
    if (!emailId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [emailId, onClose]);

  if (!emailId || !mounted) return null;

  const messages = email?.messages ?? [];

  const ui = (
    <>
      {/* Backdrop covers everything (full viewport, ~40% black) */}
      <div
        className="fixed inset-0 z-[100] bg-black/40"
        onClick={onClose}
      />
      {/* Drawer pinned to top-right edge, full screen height, above topbar */}
      <aside className="fixed top-0 right-0 z-[110] h-screen w-full max-w-[720px] bg-surface shadow-e3 flex flex-col">
        {/* Header */}
        <header className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Mail size={16} className="text-primary shrink-0" />
            <div className="min-w-0">
              <div className="font-medium truncate">
                {email?.subject ?? 'Loading…'}
              </div>
              <div className="text-caption text-ink-muted truncate">
                {messages.length > 0
                  ? `${messages.length} message${messages.length === 1 ? '' : 's'}${refresh.isPending ? ' · syncing…' : ''}`
                  : email
                  ? `${email.fromEmail} → ${email.toEmail}`
                  : ''}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
              className="h-8 w-8 rounded-md text-neutral hover:text-primary hover:bg-background flex items-center justify-center"
              title="Sync now"
              aria-label="Sync now"
            >
              <RefreshCw
                size={14}
                className={refresh.isPending ? 'animate-spin' : ''}
              />
            </button>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-md text-neutral hover:text-ink hover:bg-background flex items-center justify-center"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        {/* Refresh-error banner (e.g. missing readonly scope) */}
        {refresh.error && (
          <div className="mx-5 mt-3 rounded-md border border-error/40 bg-errorBg p-3 text-bodysm flex items-start gap-2">
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
        <div className="flex-1 overflow-y-auto scroll-thin px-5 py-5 space-y-4 bg-background">
          {isLoading || !email ? (
            <div className="text-ink-muted text-bodysm">Loading…</div>
          ) : messages.length === 0 ? (
            <div className="py-8 text-center text-ink-muted text-bodysm border border-dashed border-border rounded-md bg-surface">
              No messages.
            </div>
          ) : (
            messages.map((m) => (
              <MessageBubble
                key={`${m.type}:${m.id}`}
                message={m}
              />
            ))
          )}
        </div>

        {/* Inline reply composer — replaces the modal popup */}
        {email && <EmailReplyComposer lead={lead} parent={email} />}
      </aside>
    </>
  );

  return createPortal(ui, document.body);
}

// ─────────────────────────────────────────────────────────────────────────
// Bubble + WhatsApp ticks
// ─────────────────────────────────────────────────────────────────────────

function MessageBubble({
  message,
}: {
  message: ThreadMessage;
}) {
  const isOutbound = message.direction === 'outbound';
  // Strip our own tracking pixel from the rendered body.
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
          {formatTime(message.timestamp)}
        </span>
      </div>

      <div
        className={
          'max-w-[78%] rounded-2xl px-4 py-2.5 text-bodysm leading-relaxed shadow-e1 ' +
          (isOutbound
            ? 'bg-primary/10 border border-primary/15 rounded-tr-md'
            : 'bg-surface border border-border rounded-tl-md')
        }
      >
        {html ? (
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="whitespace-pre-wrap font-sans">
            {text || '(no body)'}
          </pre>
        )}

        {/* Attachments */}
        {message.attachments.length > 0 && (
          <div className="mt-3 pt-2 border-t border-border space-y-1">
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

        {/* Footer line: WhatsApp ticks (outbound only) */}
        {isOutbound && (
          <div className="mt-1.5 flex items-center justify-end gap-1 text-caption text-neutral">
            {message.error && (
              <span className="text-error inline-flex items-center gap-1" title={message.error}>
                <AlertCircle size={11} /> failed
              </span>
            )}
            {!message.error && (
              <Ticks
                status={message.status}
                openedAt={message.openedAt ?? null}
              />
            )}
          </div>
        )}

        {/* Read indicator on every opened outbound bubble (root + replies) */}
        {isOutbound && message.openedAt && (
          <div className="mt-0.5 text-right text-caption text-success">
            Read {relativeTime(new Date(message.openedAt))}
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * WhatsApp-style ticks:
 *   sending  → ✓     (one grey)
 *   sent     → ✓✓   (two grey)
 *   opened   → ✓✓   (two green)
 *   failed   → handled separately
 */
function Ticks({
  status,
  openedAt,
}: {
  status: string | undefined;
  openedAt: string | null;
}) {
  if (status === 'sending' || status === 'queued') {
    return (
      <span className="inline-flex items-center text-neutral">
        <Clock size={12} />
      </span>
    );
  }
  const opened = !!openedAt;
  const color = opened ? 'text-success' : 'text-neutral';
  return (
    <span
      className={`inline-flex items-center ${color}`}
      title={
        opened
          ? `Opened ${new Date(openedAt!).toLocaleString()}`
          : 'Sent — not opened yet'
      }
    >
      <CheckCheck size={14} strokeWidth={2.4} />
    </span>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function relativeTime(d: Date): string {
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
